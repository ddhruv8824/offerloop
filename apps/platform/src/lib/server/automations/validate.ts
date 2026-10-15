// Server only. Never trust a workflow as the browser sent it: rebuild it field by field.
import { isValidTimeZone } from "@/lib/schedule";
import { ACTION_BY_ID, RENAMED_ACTIONS, type Trigger, type Workflow, type WorkflowStep } from "@/lib/workflow-defs";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

function parseTrigger(raw: unknown): Trigger {
  const t = (raw ?? {}) as Record<string, unknown>;
  const time = typeof t.time === "string" && TIME.test(t.time) ? t.time : "09:00";
  if (t.kind === "daily") return { kind: "daily", time };
  if (t.kind === "weekly") return { kind: "weekly", day: DAYS.includes(t.day as string) ? (t.day as string) : "Monday", time };
  return { kind: "manual" };
}

function parseSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: WorkflowStep[] = [];
  for (const item of raw.slice(0, 30)) {
    const s = (item ?? {}) as Record<string, unknown>;
    const actionId = RENAMED_ACTIONS[String(s.actionId)] ?? String(s.actionId);
    const def = ACTION_BY_ID[actionId];
    if (!def || typeof s.uid !== "string" || !ID.test(s.uid)) continue;
    // Keep only the settings this step defines, coerced to the type it expects.
    const given = (s.settings ?? {}) as Record<string, unknown>;
    const settings: Record<string, number | string> = {};
    for (const setting of def.settings ?? []) {
      const value = given[setting.key];
      if (setting.type === "number") {
        const n = Number(value);
        settings[setting.key] = Number.isFinite(n) ? Math.min(1000, Math.max(0, Math.round(n))) : setting.default;
      } else {
        settings[setting.key] = setting.options.includes(value as string) ? (value as string) : setting.default;
      }
    }
    steps.push({ uid: s.uid, actionId, settings });
  }
  return steps;
}

/** A clean workflow, or null if it has no usable id. `previous` keeps server-owned fields. */
export function parseWorkflow(raw: unknown, timezone: unknown, previous?: Workflow): Workflow | null {
  const w = (raw ?? {}) as Record<string, unknown>;
  if (typeof w.id !== "string" || !ID.test(w.id)) return null;
  const trigger = parseTrigger(w.trigger);
  const sameSchedule = previous && JSON.stringify(previous.trigger) === JSON.stringify(trigger);
  return {
    id: w.id,
    name: (typeof w.name === "string" ? w.name.trim().slice(0, 80) : "") || "My workflow",
    trigger,
    steps: parseSteps(w.steps),
    enabled: w.enabled !== false,
    updatedAt: new Date().toISOString(),
    timezone: isValidTimeZone(timezone as string) ? (timezone as string) : previous?.timezone,
    // Only the scheduler sets this; drop it when the schedule itself changed.
    lastScheduledFor: sameSchedule ? previous.lastScheduledFor : undefined,
  };
}
