"use client";

import Link from "next/link";
import { ArrowRight, Hand, Workflow } from "lucide-react";
import { Card } from "@/components/ui";
import { useAutomations, type WorkflowRun } from "@/lib/workflows";
import { RunStatusBadge } from "./RunDetails";

const RECENT_MS = 7 * 86_400_000;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** What a finished run has to say: its summary step, else its last message, else why it failed. */
function summaryOf(run: WorkflowRun) {
  if (run.status === "failed") return run.error ?? "The run failed.";
  const summary = run.steps.find((s) => s.actionId === "workflow.summary" && s.message);
  const last = [...run.steps].reverse().find((s) => s.message && s.status !== "skipped");
  return summary?.message ?? last?.message ?? "Finished.";
}

/**
 * Where a workflow's "summary" is delivered: the dashboard. Shows runs waiting for the
 * user first, then what the most recent run found.
 */
export function RunUpdates() {
  const { runs, ready } = useAutomations();
  if (!ready) return null;

  const waiting = runs.filter((r) => r.status === "waiting_approval");
  const latest = runs.find((r) => (r.status === "completed" || r.status === "failed") && Date.now() - new Date(r.startedAt).getTime() < RECENT_MS);
  if (!waiting.length && !latest) return null;

  return (
    <section aria-label="Automation updates" className="mb-6 space-y-3">
      {waiting.map((run) => (
        <Link key={run.id} href="/automations" className="flex items-center gap-3 rounded-lg bg-ink px-5 py-3.5 text-paper hover:bg-ink-soft">
          <Hand className="size-5 shrink-0 text-coral" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{run.workflowName}</span> found {run.jobs.length} {run.jobs.length === 1 ? "job" : "jobs"} and is waiting for your approval.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-coral">
            Review <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ))}

      {latest && (
        <Card className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-coral-wash text-coral-strong">
            <Workflow className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {latest.workflowName}
              <RunStatusBadge status={latest.status} />
              <span className="text-xs font-normal text-muted">
                {latest.startedBy === "schedule" ? "Scheduled run" : "Run by you"} · {when(latest.startedAt)}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-text/80">{summaryOf(latest)}</p>
          </div>
          <Link href="/automations" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-coral-strong hover:underline">
            Details <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      )}
    </section>
  );
}
