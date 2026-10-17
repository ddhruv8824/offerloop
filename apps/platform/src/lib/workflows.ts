"use client";

import { useEffect, useState } from "react";
import { toSearchProfile } from "./job-finder";
import { getProfile } from "./profile";
import type { ApplyItem } from "./apply-queue";
import { addCard, recordAgentResult, trackedUrls } from "./tracker";
import { normaliseWorkflow, type Workflow, type WorkflowRun } from "./workflow-defs";

export * from "./workflow-defs";

/**
 * Automations in the browser: workflows and their runs live on the server (so they run
 * while the browser is closed); this keeps one shared, polled copy for every component.
 */

export type SavedWorkflow = Workflow & { nextRunAt: string | null };

export type { ApplyItem };

export interface AgentStatus {
  connected: boolean;
  createdAt?: string;
  lastSeenAt?: string | null;
}

export interface AutomationsState {
  workflows: SavedWorkflow[];
  runs: WorkflowRun[];
  hasProfile: boolean;
  scheduler: { running: boolean; startedAt: string | null; lastTickAt: string | null };
  /** Latest Hirist applications handled by the job agent on the user's PC. */
  applyQueue: ApplyItem[];
  agent: AgentStatus;
}

interface Snapshot {
  ready: boolean;
  error: string | null;
  data: AutomationsState;
}

const EMPTY: AutomationsState = {
  workflows: [],
  runs: [],
  hasProfile: false,
  scheduler: { running: false, startedAt: null, lastTickAt: null },
  applyQueue: [],
  agent: { connected: false },
};
let snapshot: Snapshot = { ready: false, error: null, data: EMPTY };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((fn) => fn());
};

const isActive = (run: WorkflowRun) => run.status === "running";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body;
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** The profile scheduled searches should use, as it is in this browser right now. */
const currentProfile = () => {
  const p = getProfile();
  return p ? toSearchProfile(p) : undefined;
};

/* ── One-time move of workflows saved by the old browser-only version ── */

const LEGACY_KEY = "jobswitch.workflows.v1";

async function migrateLegacy(serverHasNone: boolean) {
  let legacy: Workflow[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as Workflow[];
  } catch {
    // unreadable: nothing to move
  }
  if (!Array.isArray(legacy) || !legacy.length) return false;
  if (serverHasNone) {
    for (const wf of legacy.slice(0, 20).reverse()) {
      await api("/api/automations", { method: "POST", body: JSON.stringify({ workflow: normaliseWorkflow(wf), timezone: browserTimeZone(), profile: currentProfile() }) });
    }
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  return serverHasNone;
}

/* ── Runs that queued jobs for the Tracker: add them here (the Tracker lives in this browser) ── */

async function applyTrackerQueue(runs: WorkflowRun[]) {
  for (const run of runs) {
    if (!run.trackerJobIds?.length || run.trackerApplied) continue;
    const existing = trackedUrls();
    for (const job of run.jobs.filter((j) => run.trackerJobIds!.includes(j.id))) {
      if (existing.has(job.url)) continue;
      addCard({ title: job.title, company: job.company, url: job.url, status: "saved", source: job.source, matchScore: job.score, byWorkflow: run.workflowName });
      existing.add(job.url);
    }
    // Tell the server it's done; if this fails the URL check above stops duplicates next time.
    await api("/api/automations/runs", { method: "POST", body: JSON.stringify({ action: "tracker-applied", runId: run.id }) }).catch(() => undefined);
  }
}

/* ── Job agent results: put them on the Tracker here (the Tracker lives in this browser) ── */

const SYNCED_KEY = "offerloop.agent.synced";

/** Results already put on this browser's Tracker — so a lost acknowledgement never adds them twice. */
function syncedHere(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberSynced(ids: string[]) {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify([...syncedHere(), ...ids].slice(-500)));
  } catch {
    // storage blocked: the server-side flag still prevents repeats in the normal case
  }
}

async function applyAgentResults(queue: ApplyItem[]) {
  const already = syncedHere();
  const finished = queue.filter((q) => !q.trackerSynced && q.status !== "queued" && q.status !== "in_progress");
  const done = finished.filter((q) => !already.has(q.id));
  if (!finished.length) return;
  for (const item of done) {
    recordAgentResult({
      title: item.title,
      company: item.company,
      url: item.url,
      status: item.status as Exclude<typeof item.status, "queued" | "in_progress">,
      message: item.message,
      workflowName: item.workflowName,
    });
  }
  rememberSynced(done.map((q) => q.id));
  await api("/api/automations/runs", { method: "POST", body: JSON.stringify({ action: "apply-synced", jobIds: finished.map((q) => q.id) }) }).catch(
    () => undefined,
  );
}

/* ── Agent key ─────────────────────────────────────────── */

/** Make a new key for the job agent (replaces the old one). Shown once — copy it. */
export async function createAgentKey(): Promise<string> {
  const { key } = await api<{ key: string }>("/api/automations/agent", { method: "POST" });
  await refreshAutomations();
  return key;
}

export async function disconnectAgent(): Promise<void> {
  await api("/api/automations/agent", { method: "DELETE" });
  await refreshAutomations();
}

/* ── Loading and polling ──────────────────────────────── */

async function load(): Promise<void> {
  try {
    let data = await api<AutomationsState>("/api/automations");
    if (await migrateLegacy(data.workflows.length === 0)) data = await api<AutomationsState>("/api/automations");
    await applyTrackerQueue(data.runs);
    await applyAgentResults(data.applyQueue ?? []);
    publish({ ready: true, error: null, data });
  } catch (err) {
    publish({ ...snapshot, ready: true, error: err instanceof Error ? err.message : "Couldn't load automations." });
  }
}

export function refreshAutomations(): Promise<void> {
  inFlight ??= load().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function schedulePoll() {
  if (timer || listeners.size === 0) return;
  // Quick while a run is in progress; otherwise just often enough to notice a scheduled run.
  const delay = snapshot.data.runs.some(isActive) ? 1500 : 30_000;
  timer = setTimeout(async () => {
    timer = null;
    if (document.visibilityState === "visible") await refreshAutomations();
    schedulePoll();
  }, delay);
}

const restartPolling = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  schedulePoll();
};

/** Workflows, recent runs and scheduler status, kept fresh while anything is mounted. */
export function useAutomations() {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const onChange = () => setState(snapshot);
    listeners.add(onChange);
    onChange();
    void refreshAutomations().then(restartPolling);
    // Polling pauses while the tab is hidden; catch up the moment it's looked at again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAutomations().then(restartPolling);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      listeners.delete(onChange);
      if (listeners.size === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);
  return { ...state.data, ready: state.ready, error: state.error };
}

/** Kept for components that only need the list. */
export function useWorkflows() {
  const { workflows, ready } = useAutomations();
  return { workflows, ready };
}

/* ── Actions ──────────────────────────────────────────── */

const after = async <T,>(work: Promise<T>): Promise<T> => {
  const result = await work;
  await refreshAutomations();
  restartPolling();
  return result;
};

export function saveWorkflow(workflow: Workflow): Promise<SavedWorkflow> {
  return after(
    api<{ workflow: SavedWorkflow }>("/api/automations", {
      method: "POST",
      body: JSON.stringify({ workflow, timezone: browserTimeZone(), profile: currentProfile() }),
    }).then((r) => r.workflow),
  );
}

export function deleteWorkflow(id: string): Promise<unknown> {
  return after(api(`/api/automations?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

/** Load one saved workflow (for the builder). */
export async function loadWorkflow(id: string): Promise<SavedWorkflow | undefined> {
  await refreshAutomations();
  return snapshot.data.workflows.find((w) => w.id === id);
}

export function runWorkflow(workflowId: string, jobUrl?: string): Promise<WorkflowRun> {
  return after(
    api<{ run: WorkflowRun }>("/api/automations/run", { method: "POST", body: JSON.stringify({ workflowId, jobUrl, profile: currentProfile() }) }).then((r) => r.run),
  );
}

export function approveRun(runId: string, jobIds: string[]): Promise<unknown> {
  return after(api("/api/automations/runs", { method: "POST", body: JSON.stringify({ action: "approve", runId, jobIds }) }));
}

export function cancelRun(runId: string): Promise<unknown> {
  return after(api("/api/automations/runs", { method: "POST", body: JSON.stringify({ action: "cancel", runId }) }));
}
