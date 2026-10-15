"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Hand, Loader2 } from "lucide-react";
import { Badge, Button, Card, scoreTone } from "@/components/ui";
import { JobInsightsLine } from "@/components/JobInsightsLine";
import { approveRun, cancelRun, type WorkflowRun } from "@/lib/workflows";

/** A run paused at "Wait for my approval": pick which jobs continue to the next steps. */
export function ApprovalCard({ run }: { run: WorkflowRun }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(run.jobs.map((j) => j.id)));
  const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: "approve" | "cancel", work: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remaining = run.steps.slice(run.cursor + 1).length;
  // Salary and culture are shown only when the workflow includes that step and it ran.
  const showInsights = run.steps.some((s) => s.actionId === "companies.insights" && s.status === "done");

  return (
    <Card className="border-coral ring-2 ring-coral/20">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <Hand className="size-4 text-coral-strong" aria-hidden />
        <p className="text-sm font-semibold">{run.workflowName} is waiting for you</p>
        <span className="text-xs text-muted">
          {run.startedBy === "schedule" ? "Scheduled run" : "Started by you"} · {new Date(run.startedAt).toLocaleString()}
        </span>
      </div>

      <fieldset disabled={busy !== null}>
        <legend className="px-5 pt-3 text-xs text-muted">
          Tick the jobs to keep. {remaining > 0 ? `The next ${remaining === 1 ? "step runs" : `${remaining} steps run`} only for those.` : ""}
        </legend>
        <ul className="divide-y divide-line">
          {run.jobs.map((job) => (
            <li key={job.id} className="flex items-start gap-3 px-5 py-3">
              <input
                type="checkbox"
                id={`job-${run.id}-${job.id}`}
                checked={picked.has(job.id)}
                onChange={() => toggle(job.id)}
                className="mt-1 size-4 accent-[var(--color-coral)]"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={`job-${run.id}-${job.id}`} className="block cursor-pointer">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold [overflow-wrap:anywhere]">{job.title}</span>
                    {job.isNew && <Badge tone="coral">New</Badge>}
                  </span>
                  <span className="block text-xs text-muted">
                    {job.company} · {job.location} · via {job.source}
                  </span>
                  {job.flags.map((flag) => (
                    <span key={flag} className="mt-1 flex items-start gap-1 text-xs text-warning">
                      <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden /> {flag}
                    </span>
                  ))}
                </label>
                {/* Outside the label: it contains a link, and a link shouldn't toggle the checkbox. */}
                {showInsights &&
                  (job.insights ? (
                    <JobInsightsLine insights={job.insights} className="mt-1.5" />
                  ) : (
                    <p className="mt-1.5 text-xs text-faint">No salary or culture data for this company yet.</p>
                  ))}
              </div>
              <Badge tone={scoreTone(job.score)} className="shrink-0">
                {job.score}%
              </Badge>
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-muted hover:text-coral-strong" aria-label={`Open ${job.title} in a new tab`}>
                <ExternalLink className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </fieldset>

      {error && (
        <p role="alert" className="px-5 pb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <Button onClick={() => act("approve", () => approveRun(run.id, [...picked]))} disabled={busy !== null}>
          {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {picked.size ? `Approve ${picked.size} & continue` : "Continue with none"}
        </Button>
        <Button variant="ghost" onClick={() => act("cancel", () => cancelRun(run.id))} disabled={busy !== null}>
          Cancel this run
        </Button>
        <span className="ml-auto text-xs text-muted">
          {picked.size} of {run.jobs.length} selected
        </span>
      </div>
    </Card>
  );
}
