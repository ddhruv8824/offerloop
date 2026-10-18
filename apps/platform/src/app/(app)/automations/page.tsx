"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, Clock, Loader2, Pencil, Play, Plus, Square, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { ApprovalCard } from "@/components/automations/ApprovalCard";
import { HiristAgentCard } from "@/components/automations/HiristAgentCard";
import { SignalCard } from "@/components/automations/SignalCard";
import { RunDetails, RunStatusBadge } from "@/components/automations/RunDetails";
import { FlowChips } from "@/components/FlowChips";
import { ProfilePrompt } from "@/components/ProfilePrompt";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { cancelRun, deleteWorkflow, describeTrigger, runWorkflow, saveWorkflow, TEMPLATES, useAutomations, type SavedWorkflow, type WorkflowRun } from "@/lib/workflows";
import { plural } from "@/lib/utils";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Automations() {
  const { workflows, runs, ready, error, scheduler, applyQueue, agent } = useAutomations();
  const { profile, ready: profileReady } = useProfile();

  const waiting = runs.filter((r) => r.status === "waiting_approval");
  const lastRun = (id: string) => runs.find((r) => r.workflowId === id);
  const needsProfile = workflows.some((w) => w.steps.some((s) => s.actionId === "jobs.find" || s.actionId === "jobs.paste"));

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Chain your tools into a workflow: pick the steps, put them in order, choose when it runs. Runs happen on the server, even with this tab closed, and always stop for your approval."
        actions={
          <ButtonLink href="/automations/builder">
            <Plus className="size-4" /> New workflow
          </ButtonLink>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-danger-wash px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {ready && !scheduler.running && workflows.some((w) => w.trigger.kind !== "manual") && (
        <p className="mb-4 flex items-start gap-2 rounded-md bg-warning-wash px-4 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> The scheduler isn&apos;t running on this server, so scheduled workflows won&apos;t start on their own. Restart
          the server; &ldquo;Run now&rdquo; still works.
        </p>
      )}
      {profileReady && !profile && needsProfile && (
        <div className="mb-6">
          <ProfilePrompt title="Job steps need your career profile">Workflows that find or score jobs use your target role, cities and skills.</ProfilePrompt>
        </div>
      )}

      {/* Waiting for approval */}
      {waiting.length > 0 && (
        <section aria-label="Needs your approval" className="mb-8 space-y-4">
          {waiting.map((run) => (
            <ApprovalCard key={run.id} run={run} />
          ))}
        </section>
      )}

      {/* Workflows */}
      <Card className="mb-8">
        <CardHeader
          title="My workflows"
          subtitle={ready ? `${plural(workflows.length, "workflow")}${scheduler.running ? " · scheduler on, checks every 30 seconds" : ""}` : " "}
        />
        {!ready ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading workflows" />
          </div>
        ) : workflows.length === 0 ? (
          <EmptyState icon={<WorkflowIcon className="size-5" />} title="No workflows yet">
            Start from a template below, or build your own from scratch.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {workflows.map((wf) => (
              <WorkflowRow key={wf.id} workflow={wf} lastRun={lastRun(wf.id)} />
            ))}
          </ul>
        )}
      </Card>

      {/* The job agent that applies on Hirist from the user's PC */}
      {ready && <HiristAgentCard agent={agent} queue={applyQueue} />}
      {ready && <SignalCard />}

      {/* Recent runs */}
      {runs.length > 0 && (
        <Card className="mb-8">
          <CardHeader title="Recent runs" subtitle="What each run did, step by step" />
          <ul className="divide-y divide-line">
            {runs.slice(0, 8).map((run, i) => (
              <li key={run.id}>
                <details open={i === 0 && run.status !== "completed"} className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-5 py-3 text-sm">
                    <span className="font-semibold">{run.workflowName}</span>
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs text-muted">
                      {run.startedBy === "schedule" ? "Scheduled" : "Run by you"} · {when(run.startedAt)}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-coral-strong group-open:hidden">Details</span>
                  </summary>
                  <div className="px-5 pb-4">
                    <RunDetails run={run} />
                    {run.status === "running" && <StopRunButton runId={run.id} />}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-muted">Start from a template</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="flex flex-col p-5">
            <p className="font-semibold">{t.name}</p>
            <p className="mt-1 text-sm text-muted">{t.description}</p>
            <div className="mt-4 flex-1">
              <FlowChips actionIds={t.actions} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-xs text-muted">{describeTrigger(t.trigger)}</span>
              <ButtonLink href={`/automations/builder?template=${t.id}`} variant="secondary" className="shrink-0 px-3 py-1.5 text-xs">
                Use template
              </ButtonLink>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WorkflowRow({ workflow: wf, lastRun }: { workflow: SavedWorkflow; lastRun?: WorkflowRun }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askLink, setAskLink] = useState(false);
  const [link, setLink] = useState("");

  const startsFromLink = wf.steps[0]?.actionId === "jobs.paste" || wf.steps.some((s) => s.actionId === "jobs.paste");
  const running = lastRun?.status === "running";

  const guard = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const run = (e?: FormEvent) => {
    e?.preventDefault();
    if (startsFromLink && !link.trim()) return setAskLink(true);
    void guard(async () => {
      await runWorkflow(wf.id, startsFromLink ? link.trim() : undefined);
      setAskLink(false);
      setLink("");
    });
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/automations/builder?id=${wf.id}`} className="font-semibold hover:underline">
              {wf.name}
            </Link>
            <Badge tone={wf.enabled ? "success" : "neutral"}>{wf.enabled ? "On" : "Paused"}</Badge>
            {lastRun && <RunStatusBadge status={lastRun.status} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden /> {describeTrigger(wf.trigger)}
            </span>
            {wf.nextRunAt && (
              <span className="inline-flex items-center gap-1 text-text">
                <CalendarClock className="size-3" aria-hidden /> Next run {when(wf.nextRunAt)}
              </span>
            )}
            {lastRun && <span>Last run {when(lastRun.startedAt)}</span>}
          </p>
          <div className="mt-2">
            <FlowChips actionIds={wf.steps.map((s) => s.actionId)} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => run()} disabled={busy || running || !wf.steps.length}>
            {busy || running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} {running ? "Running…" : "Run now"}
          </Button>
          <label className="mx-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={wf.enabled}
              disabled={busy}
              onChange={(e) => void guard(() => saveWorkflow({ ...wf, enabled: e.target.checked }))}
              className="accent-[var(--color-coral)]"
            />
            Enabled
          </label>
          <Link href={`/automations/builder?id=${wf.id}`} className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-text" aria-label={`Edit ${wf.name}`}>
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => confirm(`Delete "${wf.name}"? Its run history stays.`) && void guard(() => deleteWorkflow(wf.id))}
            className="rounded-md p-2 text-muted hover:bg-danger-wash hover:text-danger"
            aria-label={`Delete ${wf.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {askLink && (
        <form onSubmit={run} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            required
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste the job link this run should start from"
            aria-label="Job link"
            className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <Button type="submit" disabled={busy || !link.trim()}>
            Start
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAskLink(false)}>
            Cancel
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** Stop a run that's working (or looks stuck): nothing more happens in it. */
function StopRunButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className="mt-3 px-3 py-1.5 text-xs"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Stop this run? Steps that already finished stay as they are.")) return;
        setBusy(true);
        try {
          await cancelRun(runId);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Stop this run
    </Button>
  );
}
