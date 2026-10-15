// Server only. The platform's small data file: saved workflows, their runs, and the
// profile automations search with. One JSON file — no database to install or pay for.
//
// There are no accounts yet, so this holds one person's data. Before a multi-user launch
// this becomes a real database keyed by user.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SearchProfile } from "@/lib/jobs";
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
}

const MAX_RUNS = 100;
const MAX_SEEN = 3000;
const MAX_OBSERVATIONS = 4000;
/** Pay goes stale: postings older than this no longer describe today's market. */
const OBSERVATION_DAYS = 120;

const dir = () => process.env.OFFERLOOP_DATA_DIR || process.env.JOBSWITCH_DATA_DIR || path.join(process.cwd(), ".data");
const file = () => path.join(dir(), "automations.json");

// Kept on globalThis: Next.js can load this module more than once in one process
// (route handlers and the scheduler are bundled separately), and they must share one queue.
const g = globalThis as unknown as { __offerloopStore?: { queue: Promise<unknown> } };
const state = (g.__offerloopStore ??= { queue: Promise.resolve() });

const empty = (): StoreData => ({ workflows: [], runs: [], seenJobs: {}, salaryObservations: [], marketScans: {} });

async function load(): Promise<StoreData> {
  try {
    const data = JSON.parse(await readFile(file(), "utf8")) as Partial<StoreData>;
    return { ...empty(), ...data };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
    // A corrupt file must not be silently replaced by an empty one.
    throw new Error(`Couldn't read ${file()}: ${err instanceof Error ? err.message : err}`);
  }
}

async function save(data: StoreData) {
  await mkdir(dir(), { recursive: true });
  data.runs = data.runs.slice(0, MAX_RUNS);
  for (const id of Object.keys(data.seenJobs)) data.seenJobs[id] = data.seenJobs[id].slice(-MAX_SEEN);
  const cutoff = new Date(Date.now() - OBSERVATION_DAYS * 86_400_000).toISOString();
  data.salaryObservations = data.salaryObservations.filter((o) => o.seenAt >= cutoff).slice(-MAX_OBSERVATIONS);
  // Write beside the file, then swap: a crash mid-write leaves the old file intact.
  const tmp = `${file()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file());
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
