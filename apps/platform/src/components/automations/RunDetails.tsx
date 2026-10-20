"use client";

import Link from "next/link";
import { Ban, Check, CircleDashed, FileText, Hand, Loader2, SkipForward, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { ACTION_BY_ID, type RunStatus, type StepStatus, type WorkflowRun } from "@/lib/workflows";
import { cn } from "@/lib/utils";

export const RUN_STATUS: Record<RunStatus, { label: string; tone: "success" | "info" | "coral" | "danger" | "neutral" }> = {
  running: { label: "Running", tone: "info" },
  waiting_approval: { label: "Waiting for you", tone: "coral" },
  completed: { label: "Finished", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const STEP_ICON: Record<StepStatus, { icon: typeof Check; className: string; label: string }> = {
  pending: { icon: CircleDashed, className: "text-faint", label: "Not started" },
  running: { icon: Loader2, className: "animate-spin text-info", label: "Running" },
  done: { icon: Check, className: "text-success", label: "Done" },
  skipped: { icon: SkipForward, className: "text-muted", label: "Skipped" },
  waiting: { icon: Hand, className: "text-coral-strong", label: "Waiting for you" },
  failed: { icon: X, className: "text-danger", label: "Failed" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return (
    <Badge tone={s.tone}>
      {status === "running" && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {s.label}
    </Badge>
  );
}

/** What every step of one run did, in order. */
export function RunDetails({ run }: { run: WorkflowRun }) {
  const kept = run.approvedJobIds ? run.jobs.filter((j) => run.approvedJobIds!.includes(j.id)) : run.jobs;
  return (
    <div>
      <ol className="space-y-2">
        {run.steps.map((step, i) => {
          const s = STEP_ICON[step.status];
          const Icon = s.icon;
          return (
            <li key={step.uid} className="flex items-start gap-2.5 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-label={s.label} />
              <div className="min-w-0">
                <span className={cn("font-medium", (step.status === "pending" || step.status === "skipped") && "text-muted")}>
                  {i + 1}. {ACTION_BY_ID[step.actionId]?.title ?? step.actionId}
                </span>
                {step.message && <p className={cn("text-xs", step.status === "failed" ? "text-danger" : "text-muted")}>{step.message}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {(run.tailored?.length ?? 0) > 0 && (
        <Link
          href={`/automations/runs/${run.id}/resumes`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-coral/40 bg-coral-wash/50 px-3 py-1.5 text-sm font-semibold text-coral-strong hover:bg-coral-wash"
        >
          <FileText className="size-4" aria-hidden /> Tailored resumes ({run.tailored!.filter((t) => t.status === "done").length} of {run.tailored!.length}): compare each with its job
        </Link>
      )}

      {run.status === "cancelled" && run.error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Ban className="size-3.5" aria-hidden /> {run.error}
        </p>
      )}

      {kept.length > 0 && run.status !== "waiting_approval" && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold text-muted">{run.approvedJobIds ? "Jobs you approved" : "Jobs found"}</p>
          <ul className="space-y-1.5">
            {kept.map((job) => (
              <li key={job.id} className="flex items-baseline gap-2 text-sm">
                <span className="w-9 shrink-0 font-mono text-xs text-muted">{job.score}%</span>
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:text-coral-strong hover:underline [overflow-wrap:anywhere]">
                  {job.title} <span className="text-muted">· {job.company}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
