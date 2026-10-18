// Server only. The platform's data, one JSON document per person plus a few shared ones —
// files (<data folder>/…) locally, or rows in Postgres when DATABASE_URL is set (see
// @offerloop/storage). Keys, in the "platform" namespace:
//
//   users/<uid>/automations      everything one person's automations need (StoreData)
//   users/<uid>/learn-notes/<k>  their AI study notes, one per tool (large, so kept apart)
//   market                       pay seen in public job postings — shared by everyone
//   index/agent-keys/<hash>      which person a job-agent key belongs to
//   index/approval-links/<hash>  which person a one-tap approval link belongs to
//
// `uid` is the person's account id ("local" on a one-person install).
import path from "node:path";
import { openStorage } from "@offerloop/storage";
import { trimQueue, type ApplyItem } from "@/lib/apply-queue";
import type { SearchProfile } from "@/lib/jobs";
import type { LearnItem } from "@/lib/learn";
import type { SalaryObservation } from "@/lib/salary";
import type { Workflow, WorkflowRun } from "@/lib/workflow-defs";
import type { ApprovalLink } from "./approval-links";
import type { SignalResult } from "./notify/signal";

export interface StoreData {
  profile?: SearchProfile;
  workflows: Workflow[];
  /** Newest first, capped. */
  runs: WorkflowRun[];
  /** Per workflow: job ids already reported, so a daily run only shows what's new. */
  seenJobs: Record<string, string[]>;
  /** Approved Hirist jobs waiting for (or done by) the job agent on the user's PC. */
  applyQueue: ApplyItem[];
  /** Tools the approved jobs ask for that aren't on the profile yet (see lib/learn.ts). */
  learning: LearnItem[];
  /** Signal alerts: CallMeBot account id and key (the key encrypted, see secret-box.ts). */
  signal?: { phone: string; keyBox: string; savedAt: string };
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

/** Shared by everyone: pay published in job postings, and when each role was last sampled. */
export interface MarketData {
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
export const platformStorage = () => openStorage({ fileRoot: dir(), namespace: "platform" });

const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const userKey = (uid: string, rest: string) => {
  if (!UID_RE.test(uid)) throw new RangeError(`invalid user id: ${uid}`);
  return `users/${uid}/${rest}`;
};

// One change at a time per document. Kept on globalThis: Next.js can load this module more
// than once in one process (route handlers and the scheduler are bundled separately).
const g = globalThis as unknown as { __offerloopQueues?: Map<string, Promise<unknown>> };
const queues = (g.__offerloopQueues ??= new Map());

function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) ?? Promise.resolve()).then(work, work);
  queues.set(
    key,
    result.catch(() => undefined),
  );
  return result;
}

/* ── One person's automations ─────────────────────────── */

const empty = (): StoreData => ({ workflows: [], runs: [], seenJobs: {}, applyQueue: [], learning: [], approvalLinks: [] });

// On a one-person install, the data from before accounts moves to the local user on first use.
let localAdopted: Promise<void> | null = null;

async function load(uid: string): Promise<StoreData> {
  if (uid === "local") {
    localAdopted ??= import("./legacy").then((m) => m.adoptLegacyData("local"));
    await localAdopted;
  }
  try {
    const saved = await platformStorage().get<Partial<StoreData> & Partial<MarketData>>(userKey(uid, "automations"));
    const { salaryObservations: _s, marketScans: _m, ...mine } = saved ?? {};
    return { ...empty(), ...mine };
  } catch (err) {
    // Damaged data must not be silently replaced by an empty store.
    throw new Error(`Couldn't read the automations data: ${err instanceof Error ? err.message : err}`, { cause: err });
  }
}

async function save(uid: string, data: StoreData) {
  data.runs = data.runs.slice(0, MAX_RUNS);
  data.applyQueue = trimQueue(data.applyQueue);
  for (const id of Object.keys(data.seenJobs)) data.seenJobs[id] = data.seenJobs[id].slice(-MAX_SEEN);
  await platformStorage().set(userKey(uid, "automations"), data);
}

/** Read one person's data. */
export function readStore(uid: string): Promise<StoreData> {
  return serialized(`user:${uid}`, () => load(uid));
}

/**
 * Change one person's data. Calls run one at a time per person, each seeing the previous
 * one's result, so concurrent requests and the scheduler never overwrite each other.
 */
export function updateStore<T>(uid: string, change: (data: StoreData) => T | Promise<T>): Promise<T> {
  return serialized(`user:${uid}`, async () => {
    const data = await load(uid);
    const result = await change(data);
    await save(uid, data);
    return result;
  });
}

/* ── Shared market data ───────────────────────────────── */

const emptyMarket = (): MarketData => ({ salaryObservations: [], marketScans: {} });

export function readMarket(): Promise<MarketData> {
  return serialized("market", async () => ({ ...emptyMarket(), ...(await platformStorage().get<Partial<MarketData>>("market")) }));
}

export function updateMarket<T>(change: (data: MarketData) => T): Promise<T> {
  return serialized("market", async () => {
    const data = { ...emptyMarket(), ...(await platformStorage().get<Partial<MarketData>>("market")) };
    const result = change(data);
    const cutoff = new Date(Date.now() - OBSERVATION_DAYS * 86_400_000).toISOString();
    data.salaryObservations = data.salaryObservations.filter((o) => o.seenAt >= cutoff).slice(-MAX_OBSERVATIONS);
    await platformStorage().set("market", data);
    return result;
  });
}

/* ── Study notes: one key per tool, outside the main document (they're large). ── */

export async function readStudyNotes<T>(uid: string, key: string): Promise<T | null> {
  return (await platformStorage().get<T>(userKey(uid, `learn-notes/${key}`))) ?? null;
}

export async function saveStudyNotes(uid: string, key: string, notes: unknown): Promise<void> {
  await platformStorage().set(userKey(uid, `learn-notes/${key}`), notes);
}

export async function deleteStudyNotes(uid: string, key: string): Promise<void> {
  await platformStorage().delete(userKey(uid, `learn-notes/${key}`));
}

/* ── Indexes: from a secret (agent key, approval link) to the person it belongs to ── */

export async function indexSet(kind: "agent-keys" | "approval-links", hash: string, value: { uid: string; [k: string]: unknown }) {
  await platformStorage().set(`index/${kind}/${hash}`, value);
}

export async function indexGet<T extends { uid: string }>(kind: "agent-keys" | "approval-links", hash: string): Promise<T | null> {
  if (!/^[a-f0-9]{16,128}$/.test(hash)) return null;
  return platformStorage().get<T>(`index/${kind}/${hash}`);
}

export async function indexDelete(kind: "agent-keys" | "approval-links", hash: string) {
  await platformStorage().delete(`index/${kind}/${hash}`);
}
