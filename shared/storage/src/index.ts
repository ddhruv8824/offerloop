// Server only. Where Offerloop keeps its data: JSON values under "/"-separated keys,
// e.g. "workspaces/abc/current_resume".
//
//   DATABASE_URL set   → a Postgres database (Supabase, Neon, any Postgres): one table,
//                        offerloop_kv, created on first use. For hosts without a lasting
//                        disk, such as Render's free plan.
//   otherwise          → one JSON file per key under a folder (local development, or a
//                        server with a disk): "a/b/c" is <folder>/a/b/c.json.
//
// Each caller passes its own folder and namespace, so features never see each other's keys.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

export interface Entry<T = unknown> {
  key: string;
  value: T;
}

export interface Storage {
  /** The value at `key`, or null if there is none. Throws if it can't be read. */
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every value directly under `prefix` (which ends with "/"), not in deeper levels. */
  list<T>(prefix: string): Promise<Array<Entry<T>>>;
  /** The keys `list` would return, without loading the values. */
  keys(prefix: string): Promise<string[]>;
}

export interface StorageOptions {
  /** Folder for the file backend. */
  fileRoot: string;
  /** Key prefix in the database, e.g. "redline" — keeps features apart in the one table. */
  namespace: string;
}

/** Which backend is in use — "database" when DATABASE_URL is set, else "files". */
export const storageKind = (): "database" | "files" => (process.env.DATABASE_URL ? "database" : "files");

/** Storage for one feature. Cheap to call: the database connection is shared. */
export function openStorage({ fileRoot, namespace }: StorageOptions): Storage {
  const url = process.env.DATABASE_URL;
  return url ? databaseStorage(url, `${namespace}/`) : fileStorage(fileRoot);
}

/** Keys are "/"-separated segments of letters, digits, ".", "_" and "-" (never "." or ".."). */
function checkKey(key: string, { prefix = false } = {}): string[] {
  const segments = key.split("/");
  if (prefix) {
    if (segments.pop() !== "") throw new RangeError(`storage prefix must end with "/": ${key}`);
    if (!segments.length) return segments;
  }
  for (const s of segments) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(s) || s === "." || s === "..") {
      throw new RangeError(`invalid storage key: ${key}`);
    }
  }
  return segments;
}

// ── files ─────────────────────────────────────────────────────────────────────

export function fileStorage(root: string): Storage {
  const file = (key: string) => path.join(root, ...checkKey(key)) + ".json";

  return {
    async get<T>(key: string) {
      let text: string;
      try {
        text = await readFile(file(key), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
      return JSON.parse(text) as T;
    },

    async set(key, value) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      // Write beside the file, then swap: a crash mid-write leaves the old file intact.
      const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
      await rename(tmp, target);
    },

    async delete(key) {
      await unlink(file(key)).catch((err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      });
    },

    async keys(prefix) {
      const dir = path.join(root, ...checkKey(prefix, { prefix: true }));
      try {
        return (await readdir(dir, { withFileTypes: true }))
          .filter((d) => d.isFile() && d.name.endsWith(".json"))
          .map((d) => prefix + d.name.slice(0, -".json".length));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },

    async list<T>(prefix: string) {
      const entries: Array<Entry<T>> = [];
      for (const key of await this.keys(prefix)) {
        try {
          entries.push({ key, value: JSON.parse(await readFile(file(key), "utf8")) });
        } catch {
          // deleted meanwhile, or not valid JSON — leave it out
        }
      }
      return entries;
    },
  };
}

// ── Postgres ──────────────────────────────────────────────────────────────────

type Sql = ReturnType<typeof postgres>;

// One connection pool per database for the whole process. Kept on globalThis because
// Next.js can load this module more than once (route handlers, the scheduler).
const g = globalThis as unknown as { __offerloopDb?: Map<string, { sql: Sql; ready: Promise<unknown> }> };
const pools = (g.__offerloopDb ??= new Map());

function connect(url: string) {
  let pool = pools.get(url);
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    const sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      // Supabase's transaction pooler (port 6543) can't use prepared statements.
      prepare: false,
      // Hosted databases need TLS; a database on this machine usually doesn't offer it.
      ssl: local ? false : "require",
      onnotice: () => {},
    });
    // The value is JSON text (not jsonb): it keeps every string as written, including
    // characters jsonb refuses, and the app parses it anyway.
    const ready = sql`
      create table if not exists offerloop_kv (
        key text primary key,
        value text not null,
        updated_at timestamptz not null default now()
      )`.catch((err) => {
      pools.delete(url); // try again on the next request instead of failing forever
      throw new Error(`Couldn't open the database (DATABASE_URL): ${err instanceof Error ? err.message : err}`, { cause: err });
    });
    pool = { sql, ready };
    pools.set(url, pool);
  }
  return pool;
}

const likePrefix = (prefix: string) => prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";

export function databaseStorage(url: string, namespace: string): Storage {
  const db = async () => {
    const { sql, ready } = connect(url);
    await ready;
    return sql;
  };
  const full = (key: string) => (checkKey(key), namespace + key);

  return {
    async get<T>(key: string) {
      const sql = await db();
      const rows = await sql<{ value: string }[]>`select value from offerloop_kv where key = ${full(key)}`;
      return rows.length ? (JSON.parse(rows[0].value) as T) : null;
    },

    async set(key, value) {
      const sql = await db();
      const text = JSON.stringify(value);
      await sql`
        insert into offerloop_kv (key, value) values (${full(key)}, ${text})
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
    },

    async delete(key) {
      const sql = await db();
      await sql`delete from offerloop_kv where key = ${full(key)}`;
    },

    async keys(prefix) {
      checkKey(prefix, { prefix: true });
      const sql = await db();
      const rows = await sql<{ key: string }[]>`
        select key from offerloop_kv where key like ${likePrefix(namespace + prefix)} escape '\\'`;
      return Array.from(rows as Iterable<{ key: string }>, (r) => r.key.slice(namespace.length)).filter(
        (key) => !key.slice(prefix.length).includes("/"),
      );
    },

    async list<T>(prefix: string) {
      checkKey(prefix, { prefix: true });
      const sql = await db();
      const start = namespace + prefix;
      const rows = await sql<{ key: string; value: string }[]>`
        select key, value from offerloop_kv where key like ${likePrefix(start)} escape '\\'`;
      return Array.from(rows as Iterable<{ key: string; value: string }>)
        .map((r) => ({ key: r.key.slice(namespace.length), value: r.value }))
        .filter((r) => !r.key.slice(prefix.length).includes("/")) // direct children only
        .map((r) => ({ key: r.key, value: JSON.parse(r.value) as T }));
    },
  };
}

/** Close database connections (tests, scripts). */
export async function closeStorage(): Promise<void> {
  await Promise.all([...pools.values()].map(({ sql }) => sql.end({ timeout: 5 })));
  pools.clear();
}
