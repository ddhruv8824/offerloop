// Server only. Encrypts small secrets people give us (e.g. their CallMeBot key) before they're
// stored, with AES-256-GCM and a key derived from INBOX_SECRET (or SECRET_KEY).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.SECRET_KEY || process.env.INBOX_SECRET || "";
  if (secret.length < 16) throw new Error("Set INBOX_SECRET (16+ characters) on the server to store secrets.");
  return createHash("sha256").update(`offerloop-secret-box-v1:${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function open(box: string): string | null {
  try {
    const raw = Buffer.from(box.replace(/^v1\./, ""), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
