// Server only. The platform's small data store: saved workflows, their runs, and the
// profile automations search with. One JSON document under the key "automations" — a file
// (<data folder>/automations.json) or, when DATABASE_URL is set, a database row (see
// @offerloop/storage). No database needed locally.
//
// There are no accounts yet, so this holds one person's data. Before a multi-user launch
// this becomes per-user data.
import path from "node:path";
import { openStorage } from "@offerloop/storage";
import { trimQueue, type ApplyItem } from "@/lib/apply-queue";
import type { SearchProfile } from "@/lib/jobs";
import type { LearnItem } from "@/lib/learn";
import type { ApprovalLink } from "./approval-links";
import type { SignalResult } from "./notify/signal";
import type { SalaryObservation } from "@/lib/salary";
import type { Workflow, WorkflowRun } from "@/lib/workflow-defs";

export interface StoreData {
  profile?: SearchProfile;
  workflows: Workflow[];
  /** Newest first, capped. */
  runs: WorkflowRun[];
  /** Per workflow: job ids already reported, so a daily run only shows what's new. */
  seenJobs: Record<string, string[]>;
  /** Every posting seen that published its pay — the raw material for "what to ask for". */
  salaryObservations: SalaryObservation[];
  /** Per role keyword: when its wide salary sample last ran. */
  marketScans: Record<string, string>;
  /** Approved Hirist jobs waiting for (or done by) the job agent on the user's PC. */
  applyQueue: ApplyItem[];
  /** Tools the approved jobs ask for that aren't on the profile yet (see lib/learn.ts). */
  learning: LearnItem[];
  /** How the last Signal message went (shown on the Automations page). */
  signalLast?: SignalResult;
  /** One-tap approve/skip links sent in Signal messages (hashes only). */
  approvalLinks: ApprovalLink[];
  /** The job agent's key, stored only as a hash. */
  agent?: {
    keyHash: string;
    createdAt: string;
    lastSeenAt?: string;
    /** Why the agent couldn't apply on its last try (e.g. logged out of Hirist); cleared once it works again. */
    problem?: { message: string; at: string };
  };
}

const MAX_RUNS = 100;
const MAX_SEEN = 3000;
const MAX_OBSERVATIONS = 4000;
/** Pay goes stale: postings older than this no longer describe today's market. */
const OBSERVATION_DAYS = 120;

const dir = () => process.env.OFFERLOOP_DATA_DIR || process.env.JOBSWITCH_DATA_DIR || path.join(process.cwd(), ".data");
const storage = () => openStorage({ fileRoot: dir(), namespace: "platform" });
const KEY = "automations";

// Kept on globalThis: Next.js can load this module more than once in one process
// (route handlers and the scheduler are bundled separately), and they must share one queue.
const g = globalThis as unknown as { __offerloopStore?: { queue: Promise<unknown> } };
const state = (g.__offerloopStore ??= { queue: Promise.resolve() });

const empty = (): StoreData => ({ workflows: [], runs: [], seenJobs: {}, salaryObservations: [], marketScans: {}, applyQueue: [], learning: [], approvalLinks: [] });

async function load(): Promise<StoreData> {
  try {
    return { ...empty(), ...(await storage().get<Partial<StoreData>>(KEY)) };
  } catch (err) {
    // Damaged data must not be silently replaced by an empty store.
    throw new Error(`Couldn't read the automations data: ${err instanceof Error ? err.message : err}`, { cause: err });
  }
}

async function save(data: StoreData) {
  data.runs = data.runs.slice(0, MAX_RUNS);
  data.applyQueue = trimQueue(data.applyQueue);
  for (const id of Object.keys(data.seenJobs)) data.seenJobs[id] = data.seenJobs[id].slice(-MAX_SEEN);
  const cutoff = new Date(Date.now() - OBSERVATION_DAYS * 86_400_000).toISOString();
  data.salaryObservations = data.salaryObservations.filter((o) => o.seenAt >= cutoff).slice(-MAX_OBSERVATIONS);
  await storage().set(KEY, data);
}

/** Read the current data. */
export function readStore(): Promise<StoreData> {
  const result = state.queue.then(load, load);
  state.queue = result.catch(() => undefined);
  return result;
}

/**
 * Change the data. Calls run one at a time, each seeing the previous one's result,
 * so concurrent requests and the scheduler never overwrite each other.
 */
export function updateStore<T>(change: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const data = await load();
    const result = await change(data);
    await save(data);
    return result;
  };
  const result = state.queue.then(run, run);
  state.queue = result.catch(() => undefined);
  return result;
}

/* ── Study notes: one storage key per tool, outside the main document (they're large). ── */

const notesKey = (key: string) => `learn-notes/${key}`;

export async function readStudyNotes<T>(key: string): Promise<T | null> {
  return (await storage().get<T>(notesKey(key))) ?? null;
}

export async function saveStudyNotes(key: string, notes: unknown): Promise<void> {
  await storage().set(notesKey(key), notes);
}

export async function deleteStudyNotes(key: string): Promise<void> {
  await storage().delete(notesKey(key));
}
