"use client";
import { withBase } from "@/lib/base-path";

/**
 * Keeps the profile, tracker and DSA progress in your account, not just this browser.
 *
 * Each still lives in localStorage (fast, works offline); this mirrors it to the server:
 * on app start, `startSync` pulls the account's copy (newest wins) or uploads this browser's
 * copy the first time; after each change, `markChanged` pushes it up (a second later, so a
 * burst of edits is one save). If this browser last belonged to another account, its copy
 * is cleared first, so nobody's data ends up in someone else's account.
 */

type DocName = "profile" | "tracker" | "dsa";

const DOCS: Record<DocName, { key: string; event: string }> = {
  profile: { key: "offerloop.profile.v1", event: "offerloop:profile" },
  tracker: { key: "offerloop.tracker.v1", event: "offerloop:tracker" },
  dsa: { key: "offerloop.dsa.v1", event: "offerloop:dsa" },
};
const META_KEY = "offerloop.sync.v1";
/** Caches that belong to one person too (job search results, seen jobs): cleared on account switch. */
const PERSONAL_CACHES = ["offerloop.jobs.result.v1", "offerloop.jobs.seen.v1", "offerloop.jobs.market.v1", "offerloop.agent.synced"];

interface Meta {
  owner?: string;
  /** When each document last changed here. */
  docs: Partial<Record<DocName, string>>;
}

function readMeta(): Meta {
  try {
    return { docs: {}, ...(JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Partial<Meta>) };
  } catch {
    return { docs: {} };
  }
}

function writeMeta(meta: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage blocked: nothing to sync either
  }
}

let enabled = false;
const timers = new Map<DocName, ReturnType<typeof setTimeout>>();

async function push(name: DocName) {
  const meta = readMeta();
  let value: unknown = null;
  try {
    const raw = localStorage.getItem(DOCS[name].key);
    value = raw ? JSON.parse(raw) : null;
  } catch {
    return;
  }
  await fetch(withBase(`/api/me/docs/${name}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, updatedAt: meta.docs[name] ?? new Date().toISOString() }),
  }).catch(() => {
    // Offline: the next change (or next app start) pushes it.
  });
}

/** Call after writing a document to localStorage. */
export function markChanged(name: DocName) {
  if (typeof window === "undefined") return;
  const meta = readMeta();
  meta.docs[name] = new Date().toISOString();
  writeMeta(meta);
  if (!enabled) return;
  clearTimeout(timers.get(name));
  timers.set(
    name,
    setTimeout(() => void push(name), 1000),
  );
}

/** Pull (or first-time upload) every document for this account. Resolves when done or after `timeoutMs`. */
export async function startSync(accountId: string, timeoutMs = 4000): Promise<void> {
  const meta = readMeta();
  if (meta.owner && meta.owner !== accountId) {
    // Another account used this browser: don't carry its data over.
    for (const { key } of Object.values(DOCS)) localStorage.removeItem(key);
    for (const key of PERSONAL_CACHES) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
    meta.docs = {};
  }
  meta.owner = accountId;
  writeMeta(meta);
  enabled = true;

  const work = Promise.all(
    (Object.keys(DOCS) as DocName[]).map(async (name) => {
      const res = await fetch(withBase(`/api/me/docs/${name}`), { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const server = (await res.json()) as { value: unknown; updatedAt: string | null };
      const localRaw = localStorage.getItem(DOCS[name].key);
      const localAt = readMeta().docs[name];
      if (server.value !== null && server.updatedAt && (!localRaw || !localAt || server.updatedAt > localAt)) {
        localStorage.setItem(DOCS[name].key, JSON.stringify(server.value));
        const m = readMeta();
        m.docs[name] = server.updatedAt;
        writeMeta(m);
        window.dispatchEvent(new Event(DOCS[name].event));
      } else if (localRaw && (!server.updatedAt || (localAt ?? "") > server.updatedAt || server.value === null)) {
        // First sign-in on this browser (or newer here): this copy becomes the account's.
        if (!localAt) markChanged(name);
        await push(name);
      }
    }),
  );
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
