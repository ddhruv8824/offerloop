// Server only. The job agent on the user's PC proves itself with a key made on the
// Automations page. Only a hash of the key is stored; the key itself is shown once.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readStore, updateStore } from "./store";

const hash = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** Make a new key (replacing any old one). Returns the key — the only time it's visible. */
export async function createAgentKey(): Promise<string> {
  const key = `olk_${randomBytes(24).toString("base64url")}`;
  await updateStore((data) => {
    data.agent = { keyHash: hash(key), createdAt: new Date().toISOString() };
  });
  return key;
}

export async function revokeAgentKey(): Promise<void> {
  await updateStore((data) => {
    delete data.agent;
  });
}

/** True when the request carries the current agent key ("Authorization: Bearer olk_…"). */
export async function isAgentRequest(req: Request): Promise<boolean> {
  const given = /^Bearer\s+(olk_[A-Za-z0-9_-]{20,64})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!given) return false;
  const expected = (await readStore()).agent?.keyHash;
  if (!expected) return false;
  const a = Buffer.from(hash(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const notAgent = () =>
  Response.json({ error: "Unknown or old agent key. Make a new one on Offerloop's Automations page." }, { status: 401 });
