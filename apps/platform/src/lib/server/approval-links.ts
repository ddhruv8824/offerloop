// Server only. One-tap approval links for the Signal message: "Approve all", "Approve #1",
// "Skip this run". Each link carries a random secret; only its hash is stored. A link opens a
// confirm page (never acts on GET — messengers open links to build previews), works for one
// run, for 24 hours, and stops working once that run is approved or skipped.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { WorkflowRun } from "@/lib/workflow-defs";

export const LINK_TTL_MS = 24 * 3600_000;
export const MAX_SINGLE_LINKS = 3;

export interface ApprovalLink {
  hash: string;
  runId: string;
  /** "all" → every job in the run; otherwise these job ids. "skip" cancels the run. */
  action: "approve" | "skip";
  jobIds: string[] | "all";
  expiresAt: string;
}

export interface MadeLinks {
  all: string;
  skip: string;
  /** One per job, best first, for the first few. */
  single: { jobId: string; token: string }[];
}

const hash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const newToken = () => randomBytes(18).toString("base64url");

/** Jobs best first: the order the message numbers them in. */
export const rankedJobs = (run: Pick<WorkflowRun, "jobs">) => [...run.jobs].sort((a, b) => b.score - a.score);

/** Make the links for a run that's now waiting; drops expired links and old ones for this run. */
export function makeApprovalLinks(links: ApprovalLink[], run: Pick<WorkflowRun, "id" | "jobs">, now = new Date()): { links: ApprovalLink[]; made: MadeLinks } {
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS).toISOString();
  const kept = links.filter((l) => l.runId !== run.id && Date.parse(l.expiresAt) > now.getTime());
  const add = (action: ApprovalLink["action"], jobIds: ApprovalLink["jobIds"]) => {
    const token = newToken();
    kept.push({ hash: hash(token), runId: run.id, action, jobIds, expiresAt });
    return token;
  };
  const made: MadeLinks = {
    all: add("approve", "all"),
    skip: add("skip", "all"),
    single: rankedJobs(run)
      .slice(0, MAX_SINGLE_LINKS)
      .map((j) => ({ jobId: j.id, token: add("approve", [j.id]) })),
  };
  return { links: kept.slice(-200), made };
}

/** The link a token belongs to, if it exists and hasn't expired. */
export function findApprovalLink(links: ApprovalLink[], token: string, now = new Date()): ApprovalLink | null {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const want = Buffer.from(hash(token));
  const link = links.find((l) => {
    const have = Buffer.from(l.hash);
    return have.length === want.length && timingSafeEqual(have, want);
  });
  return link && Date.parse(link.expiresAt) > now.getTime() ? link : null;
}

/** The job ids a link approves, within the run as it is now. */
export const linkJobIds = (link: ApprovalLink, run: Pick<WorkflowRun, "jobs">) =>
  link.jobIds === "all" ? run.jobs.map((j) => j.id) : run.jobs.filter((j) => (link.jobIds as string[]).includes(j.id)).map((j) => j.id);
