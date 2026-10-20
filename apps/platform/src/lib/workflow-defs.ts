/**
 * Automations: the user chains tool actions into a workflow. Each action says
 * what it needs and what it produces, so the builder can warn when steps are
 * in an order that can't work (e.g. "Tailor resume" before any job exists).
 *
 * The only action that acts on the user's behalf is "Apply on Hirist"
 * (Job-apply-tool), and it needs "approval" as an input — so it can only run
 * after a "Wait for my approval" step. Nothing is ever messaged or emailed.
 */

// Type-only: erased at runtime, so this file keeps no runtime dependencies.
import type { JobInsights } from "./company-info";
import type { FitVerdict } from "./jobs";

export type Artifact = "job" | "company" | "insights" | "resume" | "practice" | "approval";

export type ToolId = "jobs" | "companies" | "resume" | "interview" | "dsa" | "tracker" | "workflow";

export interface ActionDef {
  id: string;
  tool: ToolId;
  title: string;
  description: string;
  needs: Artifact[];
  produces: Artifact[];
  settings?: ActionSetting[];
  /** Acts on the user's account (shown with a warning badge in the builder). */
  actsForYou?: boolean;
  /** Its tool isn't part of the launch yet: hidden from the builder and skipped when run. */
  comingSoon?: boolean;
}

export type ActionSetting =
  | { key: string; label: string; type: "number"; default: number; suffix?: string }
  | { key: string; label: string; type: "select"; default: string; options: string[] };

export const ACTIONS: ActionDef[] = [
  {
    id: "jobs.find",
    tool: "jobs",
    title: "Find new jobs",
    description: "Search Hirist and company career pages for roles that fit your profile.",
    needs: [],
    produces: ["job"],
    settings: [
      { key: "source", label: "From", type: "select", default: "Hirist + career pages", options: ["Hirist + career pages", "Hirist only", "Career pages only"] },
      {
        key: "newTools",
        label: "New tools in the JD",
        type: "select",
        default: "Lower the match",
        options: ["Lower the match", "Don't count — add to Learn"],
      },
      { key: "minScore", label: "Minimum match", type: "number", default: 70, suffix: "%" },
      { key: "max", label: "At most", type: "number", default: 10, suffix: "jobs" },
    ],
  },
  {
    id: "jobs.paste",
    tool: "jobs",
    title: "Use a job I paste",
    description: "Start from one job description or link you provide when the workflow runs.",
    needs: [],
    produces: ["job"],
  },
  {
    id: "companies.research",
    tool: "companies",
    title: "Research the company",
    description: "Latest news, signals and interview experiences for each job's company.",
    needs: ["job"],
    produces: ["company"],
    comingSoon: true,
  },
  {
    id: "companies.insights",
    tool: "companies",
    title: "Get salary & culture insights",
    description: "What to ask for on each job, the salary it states (if any), and the company's employee rating, benefits and size. Shown with the jobs you review.",
    needs: ["job"],
    produces: ["insights"],
  },
  {
    id: "resume.tailor",
    tool: "resume",
    title: "Tailor my resume",
    description:
      "Tailor your Resume Studio resume to each job's description with your AI key, and save each one as a version to review and download. Put it after “Wait for my approval” to tailor only the jobs you approve.",
    needs: ["job"],
    produces: ["resume"],
    settings: [{ key: "max", label: "At most", type: "number", default: 5, suffix: "resumes" }],
  },
  {
    id: "resume.cover",
    tool: "resume",
    title: "Draft a cover letter",
    description: "A short cover letter from the tailored resume and the job description.",
    needs: ["job", "resume"],
    produces: [],
  },
  {
    id: "dsa.questions",
    tool: "dsa",
    title: "Pick DSA questions",
    description: "The company's most-asked LeetCode questions, added to your DSA Prep list.",
    needs: ["job"],
    produces: ["practice"],
    settings: [{ key: "count", label: "Questions", type: "number", default: 10 }],
  },
  {
    id: "interview.mock",
    tool: "interview",
    title: "Set up a mock interview",
    description: "A voice practice session built from the job and company.",
    needs: ["job"],
    produces: ["practice"],
    comingSoon: true,
    settings: [{ key: "minutes", label: "Length", type: "number", default: 30, suffix: "min" }],
  },
  {
    id: "workflow.approval",
    tool: "workflow",
    title: "Wait for my approval",
    description: "Pause here until you review and approve. Nothing after this runs without you.",
    needs: [],
    produces: ["approval"],
  },
  {
    id: "hirist.apply",
    tool: "jobs",
    title: "Apply on Hirist",
    description:
      "Apply to the Hirist jobs you approved, from your own logged-in Hirist in Chrome on your PC (the job agent). At most 15 a day; jobs with screening questions come back to you.",
    needs: ["job", "approval"],
    produces: [],
    actsForYou: true,
    settings: [{ key: "max", label: "At most", type: "number", default: 15, suffix: "per run" }],
  },
  {
    id: "tracker.add",
    tool: "tracker",
    title: "Add to my tracker",
    description: "Create or update a tracker card with everything prepared so far.",
    needs: ["job"],
    produces: [],
  },
  {
    id: "workflow.summary",
    tool: "workflow",
    // Nothing is emailed or messaged: the summary is shown on the dashboard and in the run's details.
    title: "Write a recap of the run",
    description: "A one-line recap of what the run did. You'll see it at the top of your Dashboard and in the run's details. Nothing is emailed.",
    needs: [],
    produces: [],
  },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<string, ActionDef>;

export type Trigger = { kind: "manual" } | { kind: "daily"; time: string } | { kind: "weekly"; day: string; time: string };

export interface WorkflowStep {
  uid: string;
  actionId: string;
  settings: Record<string, number | string>;
}

export interface Workflow {
  id: string;
  name: string;
  trigger: Trigger;
  steps: WorkflowStep[];
  enabled: boolean;
  updatedAt: string;
  /** IANA timezone the schedule's clock time is in (the browser's, set on save). */
  timezone?: string;
  /** The scheduled moment the last automatic run was for — stops a slot running twice. */
  lastScheduledFor?: string;
}

/** Steps renamed since a workflow was saved; applied when workflows are loaded. */
export const RENAMED_ACTIONS: Record<string, string> = { "practice.problems": "dsa.questions" };

/** Drop steps that no longer exist and apply renames, so old saved workflows keep working. */
export function normaliseWorkflow(wf: Workflow): Workflow {
  return {
    ...wf,
    steps: (wf.steps ?? []).map((st) => ({ ...st, actionId: RENAMED_ACTIONS[st.actionId] ?? st.actionId })).filter((st) => ACTION_BY_ID[st.actionId]),
  };
}

/* ── Runs ─────────────────────────────────────────────── */

export type RunStatus = "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "waiting" | "failed";

export interface RunStep {
  uid: string;
  actionId: string;
  status: StepStatus;
  message?: string;
  /** When the step last started running (to spot one a restart cut off). */
  startedAt?: string;
}

/** A job a run found, small enough to store with the run. */
export interface RunJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
  source: string;
  /** Not seen by an earlier run of this workflow. */
  isNew: boolean;
  flags: string[];
  /** Skills the posting asks for that aren't on the profile (the "Learn" list is built from these). */
  missing?: string[];
  /** "Strong fit", "Good fit"… and the main reasons for and against (runs from before lack these). */
  verdict?: FitVerdict;
  strengths?: string[];
  gaps?: string[];
  /** Years of experience the posting asks for, when it says. */
  minExperience?: number;
  maxExperience?: number;
  /** Salary and culture data for this job, when any exists. Shown once the insights step has run. */
  insights?: JobInsights;
}

export type { JobInsights };

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  startedBy: "schedule" | "manual";
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  steps: RunStep[];
  /** Times the run was picked up again after a server restart cut a step off. */
  restarts?: number;
  /** Index of the step to run next. */
  cursor: number;
  /** For workflows that start from "Use a job I paste": the link given when the run was started. */
  jobUrl?: string;
  jobs: RunJob[];
  /** Set when the user approves: only these jobs continue. */
  approvedJobIds?: string[];
  /** Jobs the run wants on the Tracker; the browser adds them and reports back. */
  trackerJobIds?: string[];
  trackerApplied?: boolean;
  /** Resumes the "Tailor my resume" step made, one per job (see /automations/runs/<id>/resumes). */
  tailored?: TailoredResume[];
  error?: string;
}

export interface TailoredResume {
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: "done" | "failed";
  /** The Resume Studio version it was saved as. */
  versionId?: string;
  atsBefore?: number;
  atsAfter?: number;
  changes?: number;
  /** Why it failed, or a note (e.g. the posting had only a short description). */
  message?: string;
  at: string;
}

export function newUid() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function makeStep(actionId: string, overrides: Record<string, number | string> = {}): WorkflowStep {
  const def = ACTION_BY_ID[actionId];
  return {
    uid: newUid(),
    actionId,
    settings: { ...Object.fromEntries((def.settings ?? []).map((s) => [s.key, s.default])), ...overrides },
  };
}

export const TEMPLATES: {
  id: string;
  name: string;
  description: string;
  trigger: Trigger;
  actions: string[];
  /** Step settings that differ from each action's defaults, by action id. */
  settings?: Record<string, Record<string, number | string>>;
}[] = [
  {
    id: "hirist-apply",
    name: "Apply on Hirist",
    description: "Every morning: find Hirist jobs, check pay & culture, tailor your resume — then apply to the ones you approve.",
    trigger: { kind: "daily", time: "09:00" },
    actions: ["jobs.find", "companies.insights", "workflow.approval", "resume.tailor", "hirist.apply", "tracker.add", "workflow.summary"],
    // Only Hirist jobs can be applied to by the agent; career-page jobs would just pile up for approval.
    settings: { "jobs.find": { source: "Hirist only", newTools: "Don't count — add to Learn" } },
  },
  {
    id: "daily-hunt",
    name: "Daily job hunt",
    description: "Every morning: find fitting jobs, check pay & culture, tailor your resume, and wait for you.",
    trigger: { kind: "daily", time: "09:00" },
    actions: ["jobs.find", "companies.insights", "workflow.approval", "resume.tailor", "tracker.add", "workflow.summary"],
  },
  {
    id: "one-job",
    name: "Apply to one job",
    description: "Paste a job: pay & culture, tailored resume, cover letter — ready for you to submit.",
    trigger: { kind: "manual" },
    actions: ["jobs.paste", "companies.insights", "resume.tailor", "resume.cover", "workflow.approval", "tracker.add"],
  },
  {
    id: "interview-prep",
    name: "Interview prep",
    description: "Got an interview? The CTC to ask for and the company's most-asked DSA questions, in order.",
    trigger: { kind: "manual" },
    actions: ["jobs.paste", "companies.insights", "dsa.questions", "workflow.summary"],
  },
];

export function fromTemplate(templateId: string): Workflow {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  return {
    id: newUid(),
    name: t.name,
    trigger: t.trigger,
    steps: t.actions.map((actionId) => makeStep(actionId, t.settings?.[actionId])),
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
}

export function blankWorkflow(): Workflow {
  return { id: newUid(), name: "My workflow", trigger: { kind: "manual" }, steps: [], enabled: true, updatedAt: new Date().toISOString() };
}

/** For each step, which of its needs aren't produced by an earlier step. */
export function missingInputs(steps: WorkflowStep[]): Artifact[][] {
  const have = new Set<Artifact>();
  return steps.map((step) => {
    const def = ACTION_BY_ID[step.actionId];
    const missing = def.needs.filter((n) => !have.has(n));
    def.produces.forEach((p) => have.add(p));
    return missing;
  });
}

export const ARTIFACT_LABEL: Record<Artifact, string> = {
  job: "a job",
  company: "company research",
  insights: "salary & culture insights",
  resume: "a tailored resume",
  practice: "practice material",
  approval: "your approval (“Wait for my approval”)",
};

export function describeTrigger(t: Trigger) {
  if (t.kind === "manual") return "Run when I start it";
  if (t.kind === "daily") return `Every day at ${t.time}`;
  return `Every ${t.day} at ${t.time}`;
}
