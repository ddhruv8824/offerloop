// The Hirist apply queue: jobs the user approved in a workflow wait here until the job
// agent on their PC picks them up, applies in their own logged-in Chrome, and reports back.
// Pure functions over plain data (tested in scripts/apply-queue.test.mjs); the server store
// and API routes call them.

/** Applications the agent may start in any 24 hours, however many are approved. */
export const DAILY_APPLY_LIMIT = 15;
/** A claimed job with no result after this long is offered again (the agent stopped mid-way). */
export const CLAIM_TIMEOUT_MS = 30 * 60_000;
const MAX_KEPT = 300;

export type ApplyStatus =
  | "queued" // waiting for the agent
  | "in_progress" // the agent took it
  | "applied"
  | "already_applied"
  | "needs_input" // Hirist wants answers / a human step: finish it on Hirist
  | "skipped" // not a Hirist one-click job (e.g. "apply on company site")
  | "failed"
  | "removed"; // taken out by the user before the agent got to it

/** Results the agent can report. */
export const FINAL_STATUSES: ApplyStatus[] = ["applied", "already_applied", "needs_input", "skipped", "failed"];

export interface ApplyItem {
  id: string;
  /** Offerloop's job id, e.g. "Hirist:1671060". */
  jobId: string;
  /** Hirist's own numeric id. */
  hiristId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  runId: string;
  workflowName: string;
  status: ApplyStatus;
  message?: string;
  queuedAt: string;
  updatedAt: string;
  /** When the agent took it — counts towards the daily limit. */
  claimedAt?: string;
  /** The browser has put the result on the Tracker. */
  trackerSynced?: boolean;
}

export interface QueueJob {
  id: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  source: string;
}

/** Hirist's numeric id from Offerloop's job id ("Hirist:123") or the job URL (".../j/slug-123"). */
export function hiristIdOf(job: Pick<QueueJob, "id" | "url">): string | null {
  const fromId = /^Hirist:(\d+)$/.exec(job.id)?.[1];
  if (fromId) return fromId;
  try {
    const url = new URL(job.url);
    if (!/(^|\.)hirist\.(tech|com)$/i.test(url.hostname)) return null;
    return /^\/j\/(?:.*-)?(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

const isActive = (item: ApplyItem) => item.status === "queued" || item.status === "in_progress";

/**
 * Add approved jobs to the queue. Non-Hirist jobs and jobs already queued, applied or
 * waiting are left out. Returns what was added and why the rest weren't.
 */
export function enqueue(
  queue: ApplyItem[],
  jobs: QueueJob[],
  run: { id: string; workflowName: string },
  { max, now = new Date(), uid }: { max: number; now?: Date; uid: () => string },
): { added: ApplyItem[]; notHirist: QueueJob[]; duplicates: QueueJob[] } {
  const added: ApplyItem[] = [];
  const notHirist: QueueJob[] = [];
  const duplicates: QueueJob[] = [];
  const at = now.toISOString();
  for (const job of jobs) {
    const hiristId = hiristIdOf(job);
    if (!hiristId) {
      notHirist.push(job);
      continue;
    }
    // Already waiting or done — don't apply twice. A failed or removed one may be queued again.
    if (queue.some((q) => q.hiristId === hiristId && q.status !== "failed" && q.status !== "removed")) {
      duplicates.push(job);
      continue;
    }
    if (added.length >= max) break;
    const item: ApplyItem = {
      id: uid(),
      jobId: job.id,
      hiristId,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      runId: run.id,
      workflowName: run.workflowName,
      status: "queued",
      queuedAt: at,
      updatedAt: at,
    };
    queue.unshift(item);
    added.push(item);
  }
  return { added, notHirist, duplicates };
}

/** Applications started in the last 24 hours. */
export function startedToday(queue: ApplyItem[], now = new Date()): number {
  const since = now.getTime() - 24 * 3600_000;
  return queue.filter((q) => q.claimedAt && Date.parse(q.claimedAt) > since && q.status !== "skipped").length;
}

/**
 * Jobs the agent took but never reported on (PC slept, Chrome closed, network dropped) go
 * back to the queue after a while. Run on every check-in, not only when the agent asks for
 * work: it only asks when something is queued, so a stuck job would otherwise stay stuck.
 */
export function reclaimStale(queue: ApplyItem[], now = new Date()): number {
  let reclaimed = 0;
  for (const q of queue) {
    if (q.status === "in_progress" && (!q.claimedAt || now.getTime() - Date.parse(q.claimedAt) > CLAIM_TIMEOUT_MS)) {
      q.status = "queued";
      q.message = "Offered again: the agent stopped before reporting a result.";
      q.claimedAt = undefined;
      q.updatedAt = now.toISOString();
      reclaimed++;
    }
  }
  return reclaimed;
}

/**
 * The agent asks for work: hand out queued jobs (oldest first) up to what's left of
 * today's limit, marking them in progress. Jobs claimed long ago with no result go back
 * to the queue first.
 */
export function claim(
  queue: ApplyItem[],
  { limit = DAILY_APPLY_LIMIT, now = new Date(), want = DAILY_APPLY_LIMIT }: { limit?: number; now?: Date; want?: number } = {},
): {
  items: ApplyItem[];
  remainingToday: number;
} {
  const at = now.toISOString();
  reclaimStale(queue, now);
  const left = Math.max(0, limit - startedToday(queue, now));
  // Oldest first. The queue holds newest first, so among jobs queued together (same time),
  // the later position is the one approved first.
  const items = queue
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => q.status === "queued")
    .sort((a, b) => a.q.queuedAt.localeCompare(b.q.queuedAt) || b.index - a.index)
    .map(({ q }) => q)
    .slice(0, Math.min(left, want));
  for (const q of items) {
    q.status = "in_progress";
    q.claimedAt = at;
    q.updatedAt = at;
    q.message = undefined;
  }
  return { items, remainingToday: left - items.length };
}

export type AgentReport = ApplyStatus | "requeue";

/** The agent reports one job's outcome. "requeue" puts it back without using up the day. */
export function report(queue: ApplyItem[], id: string, status: AgentReport, message: string | undefined, now = new Date()): ApplyItem | null {
  const item = queue.find((q) => q.id === id);
  if (!item || item.status !== "in_progress") return null;
  const at = now.toISOString();
  if (status === "requeue" || status === "queued") {
    item.status = "queued";
    item.claimedAt = undefined;
  } else if (status === "in_progress") {
    return null;
  } else {
    item.status = status;
  }
  item.message = message?.slice(0, 300);
  item.updatedAt = at;
  return item;
}

/**
 * The user takes a job back before the agent applies to it. Only waiting jobs can be
 * removed — one the agent has taken may already be submitted. Returns the job, or null.
 */
export function remove(queue: ApplyItem[], id: string, now = new Date()): ApplyItem | null {
  const item = queue.find((q) => q.id === id);
  if (!item || item.status !== "queued") return null;
  item.status = "removed";
  item.message = "Removed by you before the agent applied.";
  item.updatedAt = now.toISOString();
  // Nothing to put on the Tracker: the job stays wherever it is there.
  item.trackerSynced = true;
  return item;
}

/** Keep the queue small: everything still active, plus the most recent finished items. */
export function trimQueue(queue: ApplyItem[]): ApplyItem[] {
  const active = queue.filter(isActive);
  const done = queue.filter((q) => !isActive(q)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...active, ...done.slice(0, Math.max(0, MAX_KEPT - active.length))];
}
