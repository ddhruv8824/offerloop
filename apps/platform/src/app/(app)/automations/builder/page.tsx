"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Check,
  Clock,
  Hand,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { bandFor, suggestAsk } from "@/lib/insights";
import { useProfile } from "@/lib/profile";
import { getCompany, JOBS } from "@/lib/sample-data";
import { getTool } from "@/lib/tools";
import type { Job } from "@/lib/types";
import {
  ACTION_BY_ID,
  ACTIONS,
  ARTIFACT_LABEL,
  blankWorkflow,
  fromTemplate,
  loadWorkflow,
  makeStep,
  missingInputs,
  saveWorkflow,
  type ToolId,
  type Trigger,
  type Workflow,
  type WorkflowStep,
} from "@/lib/workflows";
import { cn, plural } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PALETTE_GROUPS: { tool: ToolId; label: string }[] = [
  { tool: "jobs", label: "Job Finder · Hirist" },
  { tool: "companies", label: "Salary & culture" },
  { tool: "resume", label: "Resume Studio" },
  { tool: "dsa", label: "DSA Prep" },
  { tool: "tracker", label: "Tracker" },
  { tool: "workflow", label: "Control" },
];

function actionIcon(actionId: string): LucideIcon {
  if (actionId === "workflow.approval") return Hand;
  if (actionId === "workflow.summary") return Bell;
  return getTool(ACTION_BY_ID[actionId].tool).icon;
}

type RunState = "idle" | "running" | "waiting" | "done";
type StepRun = { status: "pending" | "running" | "done" | "waiting"; output?: string };

/** The sample jobs a test run works on: what "Find new jobs" keeps, or one pasted job. */
function runJobs(steps: WorkflowStep[]): Job[] {
  const find = steps.find((s) => s.actionId === "jobs.find");
  if (!find) return JOBS.slice(0, 1);
  const source = String(find.settings.source);
  return JOBS.filter((j) => (source === "Hirist only" ? j.source === "Hirist" : source === "Career pages only" ? j.source !== "Hirist" : true))
    .filter((j) => j.matchScore >= Number(find.settings.minScore))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, Number(find.settings.max));
}

/** What a test run reports for each step, using sample data. */
function sampleOutput(step: WorkflowStep, jobs: Job[], minSalaryLpa?: number): string {
  const s = step.settings;
  const jobCount = jobs.length;
  switch (step.actionId) {
    case "jobs.find": {
      const onHirist = jobs.filter((j) => j.source === "Hirist").length;
      return `Searched ${String(s.source ?? "all sources")}: kept ${plural(jobCount, "role")} at ${s.minScore}%+ match (${onHirist} on Hirist)`;
    }
    case "jobs.paste":
      return `Using: ${jobs[0].title} at ${getCompany(jobs[0].companySlug)?.name} (sample)`;
    case "companies.insights": {
      const lines = jobs.map((j) => {
        const company = getCompany(j.companySlug)!;
        const band = bandFor(company, j.title);
        const label = `${j.title} · ${company.name}`;
        if (!band || !company.insights) return `${label}: not enough salary data yet`;
        const { ask } = suggestAsk(band, minSalaryLpa);
        return `${label}: ask ${ask} LPA (market ${band.low}–${band.high}) · work-life ${company.insights.culture.workLife}/5 · ${company.insights.culture.workMode}`;
      });
      return lines.length ? lines.join("\n") : "No jobs to look up";
    }
    case "hirist.apply": {
      const hirist = jobs.filter((j) => j.source === "Hirist").slice(0, Number(s.max));
      if (!hirist.length) return "None of the approved jobs are on Hirist — nothing to apply to";
      const names = hirist.map((j) => `${j.title} · ${getCompany(j.companySlug)?.name}`).join(", ");
      return `Would apply to ${plural(hirist.length, "Hirist job")}: ${names}. Questionnaires filled from your profile (test run — nothing was sent)`;
    }
    case "companies.research":
      return `Researched ${jobCount} ${jobCount === 1 ? "company" : "companies"}: news, signals, interview notes`;
    case "resume.tailor":
      return `${jobCount} tailored resume ${jobCount === 1 ? "draft" : "drafts"} — edits waiting for your review`;
    case "resume.cover":
      return `${jobCount} cover letter ${jobCount === 1 ? "draft" : "drafts"} ready`;
    case "dsa.questions": {
      const names = [...new Set(jobs.map((j) => getCompany(j.companySlug)?.name))].filter(Boolean);
      return `Added the top ${s.count} LeetCode questions for ${names.join(", ") || "the company"} to DSA Prep`;
    }
    case "interview.mock":
      return `Mock interview ready · ${s.minutes} min`;
    case "tracker.add":
      return `Added ${jobCount} ${jobCount === 1 ? "card" : "cards"} to your Tracker`;
    case "workflow.summary":
      return "Recap shown at the top of your dashboard";
    default:
      return "Done";
  }
}

export default function Builder() {
  const router = useRouter();
  const { profile } = useProfile();
  const [wf, setWf] = useState<Workflow | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [run, setRun] = useState<RunState>("idle");
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const timers = useRef<number[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const template = params.get("template");
    // Saved workflows live on the server; a new one starts from a template or blank.
    void (id ? loadWorkflow(id) : Promise.resolve(undefined)).then((existing) => {
      if (!alive) return;
      if (existing) {
        setWf(existing);
        setIsNew(false);
        setSaved(true);
      } else {
        setWf(template ? fromTemplate(template) : blankWorkflow());
        setPaletteOpen(!template);
      }
    });
    const pending = timers.current;
    return () => {
      alive = false;
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (!wf) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading" />
      </div>
    );
  }

  const missing = missingInputs(wf.steps);
  const problems = missing.filter((m) => m.length > 0).length;
  const approvals = wf.steps.filter((s) => s.actionId === "workflow.approval").length;
  const canRun = wf.steps.length > 0 && problems === 0;

  const update = (patch: Partial<Workflow>) => {
    setWf({ ...wf, ...patch });
    setSaved(false);
    resetRun();
  };
  const setSteps = (steps: WorkflowStep[]) => update({ steps });
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...wf.steps];
    [steps[i], steps[i + dir]] = [steps[i + dir], steps[i]];
    setSteps(steps);
  };
  const setTrigger = (trigger: Trigger) => update({ trigger });
  const setSetting = (uid: string, key: string, value: number | string) =>
    setSteps(wf.steps.map((s) => (s.uid === uid ? { ...s, settings: { ...s.settings, [key]: value } } : s)));

  function resetRun() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setRun("idle");
    setStepRuns([]);
  }

  // Simulated run: steps finish one by one and stop at each approval until the user continues.
  function runFrom(start: number, runs: StepRun[]) {
    const jobs = runJobs(wf!.steps);
    setRun("running");
    let delay = 0;
    for (let i = start; i < wf!.steps.length; i++) {
      const step = wf!.steps[i];
      const at = delay;
      timers.current.push(
        window.setTimeout(() => {
          runs = runs.map((r, j) => (j === i ? { status: "running" } : r));
          setStepRuns(runs);
        }, at),
      );
      if (step.actionId === "workflow.approval") {
        timers.current.push(
          window.setTimeout(() => {
            runs = runs.map((r, j) => (j === i ? { status: "waiting", output: "Waiting for you to review and approve" } : r));
            setStepRuns(runs);
            setRun("waiting");
          }, at + 500),
        );
        return;
      }
      delay += 800;
      timers.current.push(
        window.setTimeout(() => {
          runs = runs.map((r, j) => (j === i ? { status: "done", output: sampleOutput(step, jobs, profile?.minSalaryLpa) } : r));
          setStepRuns(runs);
          if (i === wf!.steps.length - 1) setRun("done");
        }, delay),
      );
    }
  }

  const startRun = () => {
    resetRun();
    const runs: StepRun[] = wf.steps.map(() => ({ status: "pending" }));
    setStepRuns(runs);
    runFrom(0, runs);
  };

  const approve = () => {
    const i = stepRuns.findIndex((r) => r.status === "waiting");
    const runs = stepRuns.map((r, j) => (j === i ? { status: "done" as const, output: "Approved by you" } : r));
    setStepRuns(runs);
    if (i === wf.steps.length - 1) setRun("done");
    else runFrom(i + 1, runs);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveWorkflow(wf);
      setSaved(true);
      if (isNew) {
        setIsNew(false);
        router.replace(`/automations/builder?id=${wf.id}`);
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // The real thing: save, start a run on the server, and go watch it.
  const saveAndRun = async () => {
    if (!(await save())) return;
    router.push("/automations");
  };
  const startsFromLink = wf.steps.some((s) => s.actionId === "jobs.paste");

  return (
    <div>
      <Link href="/automations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Automations
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <div className="min-w-0">
          <input
            value={wf.name}
            onChange={(e) => update({ name: e.target.value })}
            aria-label="Workflow name"
            className="mb-5 w-full rounded-md border border-transparent bg-transparent px-1 font-display text-2xl font-semibold outline-none hover:border-line focus:border-ink focus:bg-paper"
          />

          {/* Trigger node */}
          <Card className="border-ink/30 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-ink text-paper">
                <Clock className="size-4" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-muted">WHEN</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {(["manual", "daily", "weekly"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={wf.trigger.kind === kind}
                      onClick={() =>
                        setTrigger(
                          kind === "manual"
                            ? { kind }
                            : kind === "daily"
                              ? { kind, time: "time" in wf.trigger ? wf.trigger.time : "09:00" }
                              : { kind, day: "Monday", time: "time" in wf.trigger ? wf.trigger.time : "09:00" },
                        )
                      }
                      className={cn(
                        "rounded-md border px-3 py-1 text-sm",
                        wf.trigger.kind === kind ? "border-ink bg-ink text-paper" : "border-line hover:border-faint",
                      )}
                    >
                      {kind === "manual" ? "When I start it" : kind === "daily" ? "Every day" : "Every week"}
                    </button>
                  ))}
                  {wf.trigger.kind === "weekly" && (
                    <select
                      value={wf.trigger.day}
                      onChange={(e) => setTrigger({ kind: "weekly", day: e.target.value, time: (wf.trigger as { time: string }).time })}
                      className="rounded-md border border-line bg-paper px-2 py-1 text-sm"
                      aria-label="Day"
                    >
                      {DAYS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  )}
                  {wf.trigger.kind !== "manual" && (
                    <input
                      type="time"
                      value={wf.trigger.time}
                      onChange={(e) => setTrigger({ ...(wf.trigger as Exclude<Trigger, { kind: "manual" }>), time: e.target.value })}
                      className="rounded-md border border-line bg-paper px-2 py-1 text-sm"
                      aria-label="Time"
                    />
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Steps */}
          <ol className="relative">
            {wf.steps.map((step, i) => {
              const def = ACTION_BY_ID[step.actionId];
              const Icon = actionIcon(step.actionId);
              const isApproval = step.actionId === "workflow.approval";
              const need = missing[i];
              const sr = stepRuns[i];
              return (
                <li key={step.uid} className="relative pt-6">
                  <span className="absolute top-0 left-[34px] h-6 w-px bg-line" aria-hidden />
                  <Card
                    className={cn(
                      "p-4 transition-colors",
                      isApproval && "border-dashed border-coral bg-coral-wash/40",
                      def.actsForYou && "border-warning/60",
                      need.length > 0 && "border-warning",
                      sr?.status === "running" && "border-info",
                      sr?.status === "waiting" && "border-coral ring-2 ring-coral/30",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-md",
                          isApproval ? "bg-coral text-ink" : "bg-coral-wash text-coral-strong",
                          sr?.status === "done" && "bg-success-wash text-success",
                        )}
                      >
                        {sr?.status === "done" ? (
                          <Check className="size-4" aria-label="Done" />
                        ) : sr?.status === "running" ? (
                          <Loader2 className="size-4 animate-spin" aria-label="Running" />
                        ) : (
                          <Icon className="size-4" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted">{i + 1}</span>
                          <p className="text-sm font-semibold">{def.title}</p>
                          <Badge>{def.tool === "workflow" ? "Control" : getTool(def.tool).name}</Badge>
                          {def.actsForYou && <Badge tone="warning">Acts on your account</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{def.description}</p>

                        {def.settings && (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {def.settings.map((setting) => (
                              <label key={setting.key} className="flex items-center gap-2 text-xs">
                                <span className="text-muted">{setting.label}</span>
                                {setting.type === "select" ? (
                                  <select
                                    value={String(step.settings[setting.key] ?? setting.default)}
                                    onChange={(e) => setSetting(step.uid, setting.key, e.target.value)}
                                    className="rounded-sm border border-line bg-paper px-2 py-1 text-xs"
                                  >
                                    {setting.options.map((o) => (
                                      <option key={o}>{o}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    value={step.settings[setting.key] ?? setting.default}
                                    onChange={(e) => setSetting(step.uid, setting.key, Number(e.target.value))}
                                    className="w-16 rounded-sm border border-line bg-paper px-2 py-1 text-xs"
                                  />
                                )}
                                {setting.type === "number" && setting.suffix && <span className="text-muted">{setting.suffix}</span>}
                              </label>
                            ))}
                          </div>
                        )}

                        {need.length > 0 && (
                          <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
                            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                            Needs {need.map((n) => ARTIFACT_LABEL[n]).join(" and ")} from an earlier step — add one above or move this step down.
                          </p>
                        )}

                        {sr?.output && (
                          <p className={cn("mt-3 rounded-sm px-2 py-1.5 text-xs whitespace-pre-line", sr.status === "waiting" ? "bg-coral-wash text-coral-strong" : "bg-success-wash text-success")}>
                            {sr.output}
                          </p>
                        )}
                        {sr?.status === "waiting" && (
                          <Button onClick={approve} className="mt-3 px-3 py-1.5 text-xs">
                            <Check className="size-3.5" /> Approve & continue
                          </Button>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30" aria-label="Move up">
                          <ArrowUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === wf.steps.length - 1}
                          className="rounded p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSteps(wf.steps.filter((s) => s.uid !== step.uid))}
                          className="rounded p-1.5 text-muted hover:bg-danger-wash hover:text-danger"
                          aria-label={`Remove ${def.title}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>

          {/* Add step */}
          <div className="relative pt-6">
            <span className="absolute top-0 left-[34px] h-6 w-px bg-line" aria-hidden />
            {paletteOpen ? (
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Add a step</p>
                  <button type="button" onClick={() => setPaletteOpen(false)} className="rounded p-1 text-muted hover:bg-ink/5" aria-label="Close">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {PALETTE_GROUPS.map((group) => (
                    <div key={group.tool}>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{group.label}</p>
                      <ul className="space-y-1">
                        {ACTIONS.filter((a) => a.tool === group.tool && !a.comingSoon).map((a) => {
                          const Icon = actionIcon(a.id);
                          return (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => setSteps([...wf.steps, makeStep(a.id)])}
                                className="flex w-full items-start gap-2 rounded-md border border-line px-3 py-2 text-left hover:border-ink"
                              >
                                <Icon className="mt-0.5 size-4 shrink-0 text-coral-strong" aria-hidden />
                                <span>
                                  <span className="block text-sm font-medium">{a.title}</span>
                                  <span className="block text-xs text-muted">{a.description}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-faint py-4 text-sm font-semibold text-muted hover:border-ink hover:text-text"
              >
                <Plus className="size-4" /> Add a step
              </button>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <p className="text-sm font-semibold">Summary</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Steps</dt>
                <dd className="font-mono">{wf.steps.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Approval checkpoints</dt>
                <dd className="font-mono">{approvals}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Tools used</dt>
                <dd className="font-mono">{new Set(wf.steps.map((s) => ACTION_BY_ID[s.actionId].tool).filter((t) => t !== "workflow")).size}</dd>
              </div>
            </dl>

            {wf.steps.length === 0 ? (
              <p className="mt-4 rounded-md bg-ink/5 px-3 py-2 text-xs text-muted">Add your first step to start.</p>
            ) : problems > 0 ? (
              <p className="mt-4 flex items-start gap-1.5 rounded-md bg-warning-wash px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                {problems === 1 ? "1 step is" : `${problems} steps are`} missing an input. Fix the order to run it.
              </p>
            ) : (
              <p className="mt-4 flex items-start gap-1.5 rounded-md bg-success-wash px-3 py-2 text-xs text-success">
                <Check className="mt-px size-3.5 shrink-0" aria-hidden /> Ready to run.
              </p>
            )}

            {approvals === 0 && wf.steps.length > 0 && (
              <p className="mt-2 text-xs text-muted">Tip: add “Wait for my approval” so you review everything before it's used.</p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}{" "}
                {saved ? "Saved" : "Save workflow"}
              </Button>
              <Button variant="dark" onClick={() => void saveAndRun()} disabled={!canRun || saving}>
                <ArrowLeft className="size-4 rotate-180" /> {saved ? "Go to runs" : "Save & go to runs"}
              </Button>
              {saveError && (
                <p role="alert" className="text-center text-xs text-danger">
                  {saveError}
                </p>
              )}
              <Button variant="ghost" onClick={startRun} disabled={!canRun || run === "running"}>
                {run === "running" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Preview with sample data
              </Button>
              {run === "waiting" && <p className="text-center text-xs text-coral-strong">Preview paused — waiting for your approval</p>}
              {run === "done" && <p className="text-center text-xs text-success">Preview finished</p>}
            </div>
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              Saved workflows run on the server{wf.trigger.kind === "manual" ? " when you press Run now" : " on their schedule, even with this tab closed"}
              {startsFromLink ? ", and ask for the job link each time" : ""}. The preview above only uses sample data. Real runs never send messages or emails.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
