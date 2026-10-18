// Server only. From a one-tap approval link's token to the person and run it belongs to.
import { findApprovalLink, linkHash, type ApprovalLink } from "./approval-links";
import { indexGet, readStore } from "./store";

export async function lookupApprovalLink(token: string): Promise<{ uid: string; link: ApprovalLink } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const entry = await indexGet<{ uid: string }>("approval-links", linkHash(token));
  if (!entry) return null;
  const link = findApprovalLink((await readStore(entry.uid)).approvalLinks, token);
  return link ? { uid: entry.uid, link } : null;
}
