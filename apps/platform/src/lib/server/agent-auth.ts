// Server only. The job agent on a person's PC proves itself with a key made on their
// Automations page. Only a hash of the key is stored — in their data, and in an index that
// says whose key it is. The key itself is shown once.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { indexDelete, indexGet, indexSet, readStore, updateStore } from "./store";

const hash = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** Make a new key for this person (replacing their old one). Returns the key — the only time it's visible. */
export async function createAgentKey(uid: string): Promise<string> {
  const key = `olk_${randomBytes(24).toString("base64url")}`;
  const old = await updateStore(uid, (data) => {
    const previous = data.agent?.keyHash;
    data.agent = { keyHash: hash(key), createdAt: new Date().toISOString() };
    return previous;
  });
  if (old) await indexDelete("agent-keys", old);
  await indexSet("agent-keys", hash(key), { uid });
  return key;
}

export async function revokeAgentKey(uid: string): Promise<void> {
  const old = await updateStore(uid, (data) => {
    const previous = data.agent?.keyHash;
    delete data.agent;
    return previous;
  });
  if (old) await indexDelete("agent-keys", old);
}

/** Whose agent this is ("Authorization: Bearer olk_…"), or null for an unknown or old key. */
export async function agentUser(req: Request): Promise<string | null> {
  const given = /^Bearer\s+(olk_[A-Za-z0-9_-]{20,64})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!given) return null;
  const entry = await indexGet<{ uid: string }>("agent-keys", hash(given));
  if (!entry) return null;
  // The index says whose key it is; their own data must still hold this exact key.
  const expected = (await readStore(entry.uid)).agent?.keyHash;
  if (!expected) return null;
  const a = Buffer.from(hash(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? entry.uid : null;
}

export const notAgent = () =>
  Response.json({ error: "Unknown or old agent key. Make a new one on Offerloop's Automations page." }, { status: 401 });
