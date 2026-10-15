// Server only. The built-in "cron": every 30 seconds, start any workflow whose schedule is due.
//
// Runs inside the one always-on server process, so there is nothing extra to deploy or pay
// for. Hosts that put the server to sleep can call POST /api/automations/tick from an
// outside timer instead — it runs the same check.
import { dueSlot, isValidTimeZone, nextOccurrence, type Schedule } from "@/lib/schedule";
import type { Workflow } from "@/lib/workflow-defs";
import { readStore, updateStore } from "../store";
import { failInterruptedRuns, startRun } from "./engine";

const TICK_MS = 30_000;
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

// On globalThis so a dev hot-reload (or a second copy of this module) never starts a second timer.
const g = globalThis as unknown as { __offerloopScheduler?: { timer?: ReturnType<typeof setInterval>; ticking: boolean; startedAt?: string; lastTickAt?: string } };
const state = (g.__offerloopScheduler ??= { ticking: false });

export const timeZoneOf = (wf: Workflow) => (isValidTimeZone(wf.timezone) ? wf.timezone : DEFAULT_TIME_ZONE);

export function nextRunAt(wf: Workflow, now = Date.now()): string | null {
  if (!wf.enabled || wf.trigger.kind === "manual") return null;
  return new Date(nextOccurrence(wf.trigger as Schedule, now, timeZoneOf(wf))).toISOString();
}

/** Start every workflow that is due. Safe to call as often as you like. */
export async function tick(now = Date.now()): Promise<{ started: string[] }> {
  if (state.ticking) return { started: [] };
  state.ticking = true;
  const started: string[] = [];
  try {
    const { workflows } = await readStore();
    for (const wf of workflows) {
      if (!wf.enabled || wf.trigger.kind === "manual" || !wf.steps.length) continue;
      const slot = dueSlot(wf.trigger as Schedule, {
        now,
        timeZone: timeZoneOf(wf),
        savedAt: Date.parse(wf.updatedAt) || 0,
        lastScheduledFor: wf.lastScheduledFor ? Date.parse(wf.lastScheduledFor) : undefined,
      });
      if (slot === null) continue;
      // Record the slot first: if the run then fails to start, we don't retry it every 30 seconds.
      const claimed = await updateStore((data) => {
        const current = data.workflows.find((w) => w.id === wf.id);
        if (!current || !current.enabled) return false;
        if (current.lastScheduledFor && Date.parse(current.lastScheduledFor) >= slot) return false;
        current.lastScheduledFor = new Date(slot).toISOString();
        return true;
      });
      if (!claimed) continue;
      try {
        await startRun(wf.id, "schedule");
        started.push(wf.name);
        console.log(`[automations] started "${wf.name}" for its ${new Date(slot).toISOString()} slot`);
      } catch (err) {
        console.error(`[automations] couldn't start "${wf.name}":`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[automations] tick failed:", err instanceof Error ? err.message : err);
  } finally {
    state.ticking = false;
    state.lastTickAt = new Date().toISOString();
  }
  return { started };
}

export function startScheduler() {
  if (state.timer) return;
  state.startedAt = new Date().toISOString();
  state.timer = setInterval(() => void tick(), TICK_MS);
  state.timer.unref?.(); // never keep the process alive just for this
  // Anything left "running" belongs to a process that no longer exists; then catch up on missed slots.
  void failInterruptedRuns()
    .catch((err) => console.error("[automations] startup check failed:", err))
    .then(() => tick());
  console.log("[automations] scheduler started (checks every 30s)");
}

export const schedulerStatus = () => ({ running: Boolean(state.timer), startedAt: state.startedAt ?? null, lastTickAt: state.lastTickAt ?? null });
