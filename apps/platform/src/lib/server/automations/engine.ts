// Server only. Runs a workflow: one step at a time, saved after every step, paused at
// "Wait for my approval" until the user approves. Closing the browser changes nothing.
//
// Each step is: claim it (quick, through the store queue) → do the work (slow, outside the
// queue, so progress checks never wait behind a 10-second job search) → record the result.
import { formatSalary, insightsFor, type JobInsights } from "@/lib/company-info";
import { scoreJob, type ScoredJob, type SearchProfile } from "@/lib/jobs";
import { DAILY_APPLY_LIMIT, enqueue, hiristIdOf } from "@/lib/apply-queue";
import { approvalMessage, shortApprovalMessage } from "@/lib/approval-message";
import { addToLearn } from "@/lib/learn";
import { LINK_TTL_MS, linkHash, makeApprovalLinks, type MadeLinks } from "@/lib/server/approval-links";
import { sendAndRecord, signalCreds, type SignalCreds, type SignalResult } from "@/lib/server/notify/signal";
import { ACTION_BY_ID, newUid, type RunJob, type RunStep, type TailoredResume, type WorkflowRun, type WorkflowStep } from "@/lib/workflow-defs";
import { NoResumeError, tailorForJob, type LlmConfig } from "@offerloop/resume-studio/server";
import { automationLlm } from "../ai-key";
import { bandPosition, recommendAsk, type MarketRange } from "@/lib/salary";
import { ImportError, importJob } from "../jobs/import";
import { salaryMarket } from "../jobs/market";
import { searchJobs } from "../jobs/search";
import { indexSet, readStore, updateStore, type StoreData } from "../store";
import { configuredSite } from "../public-url";

interface StepOutcome {
  status: "done" | "skipped" | "waiting";
  message: string;
  /** Changes to save with the result (applied inside the store queue). May return the final message. */
  apply?: (run: WorkflowRun, data: StoreData) => string | void;
}

interface StepContext {
  uid: string;
  run: WorkflowRun;
  /** The AI key the person saved for automations (or the server's), if any. */
  llm: LlmConfig | null;
  profile?: SearchProfile;
  seenJobIds: string[];
  /** Hirist ids already in the apply queue (waiting, applying, applied, needing you…). */
  handledHiristIds: Set<string>;
}

/** An expected failure with a message meant for the user. */
class StepFailure extends Error {}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const toRunJob = (j: ScoredJob, isNew: boolean): RunJob => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  url: j.url,
  score: j.score,
  source: j.source,
  isNew,
  flags: j.vetoed ? [`Hits a deal-breaker: ${j.vetoed}`, ...j.flags] : j.flags,
  verdict: j.fit?.verdict,
  missing: j.missing,
  strengths: j.fit?.strengths,
  gaps: j.fit?.gaps,
  minExperience: j.minExperience,
  maxExperience: j.maxExperience,
  insights: insightsFor(j),
});

/** The jobs later steps work on: everything found, or only what the user approved. */
export const activeJobs = (run: WorkflowRun) => (run.approvedJobIds ? run.jobs.filter((j) => run.approvedJobIds!.includes(j.id)) : run.jobs);

/* ── Steps ────────────────────────────────────────────── */

// Tools that exist but can't be driven by the server yet. Said plainly rather than faked.
const NOT_CONNECTED: Record<string, string> = {
  "companies.research": "Skipped: Company Intel is coming soon. Remove this step from the workflow.",
  "resume.cover": "Skipped: cover letters aren't built yet.",
  "interview.mock": "Skipped: Interview Coach is coming soon. Remove this step from the workflow.",
};

const NO_PROFILE = "No career profile yet. Set up your profile in Offerloop, then run this again.";

async function runStep(step: WorkflowStep, ctx: StepContext): Promise<StepOutcome> {
  const { run, profile } = ctx;
  const settings = step.settings ?? {};
  const jobs = activeJobs(run);

  if (NOT_CONNECTED[step.actionId]) return { status: "skipped", message: NOT_CONNECTED[step.actionId] };

  switch (step.actionId) {
    case "jobs.find": {
      if (!profile) throw new StepFailure(NO_PROFILE);
      const roleFirst = String(settings.newTools ?? "").startsWith("Don't count");
      const result = await searchJobs(profile, 300, { roleFirst });
      const source = String(settings.source ?? "");
      const minScore = Number(settings.minScore ?? 0);
      const max = Math.max(1, Math.min(50, Number(settings.max ?? 10)));
      const seen = new Set(ctx.seenJobIds);
      const matching = result.jobs
        .filter((j) => (source === "Hirist only" ? j.source === "Hirist" : source === "Career pages only" ? j.source !== "Hirist" : true))
        .filter((j) => j.score >= minScore);
      // Jobs already applied to (or queued, or waiting for you) aren't worth approving again.
      const handled = (j: ScoredJob) => {
        const hiristId = hiristIdOf(j);
        return hiristId !== null && ctx.handledHiristIds.has(hiristId);
      };
      const fits = matching.filter((j) => !handled(j));
      const alreadyHandled = matching.length - fits.length;
      // A scheduled run reports only what's new since last time; a manual run shows everything.
      const picked = (run.startedBy === "schedule" ? fits.filter((j) => !seen.has(j.id)) : fits).slice(0, max).map((j) => toRunJob(j, !seen.has(j.id)));
      const fresh = picked.filter((j) => j.isNew).length;
      const failed = result.sources.filter((s) => !s.ok).length;
      return {
        status: "done",
        message:
          `Scanned ${result.scanned.toLocaleString("en-IN")} open roles; ${plural(fits.length, "job")} at ${minScore}%+ match` +
          (run.startedBy === "schedule" ? `, ${fresh} new since the last run.` : `, kept the top ${picked.length} (${fresh} new).`) +
          (alreadyHandled ? ` Hid ${plural(alreadyHandled, "job")} you've already applied to or queued.` : "") +
          (result.hiddenCount ? ` ${plural(result.hiddenCount, "job")} left out for your deal-breakers.` : "") +
          (failed ? ` ${plural(failed, "source")} didn't respond.` : ""),
        apply: (r, data) => {
          r.jobs = picked;
          data.seenJobs[r.workflowId] = [...new Set([...(data.seenJobs[r.workflowId] ?? []), ...picked.map((j) => j.id)])];
        },
      };
    }

    case "jobs.paste": {
      if (!run.jobUrl) throw new StepFailure("This workflow starts from a job link. Use “Run now” and paste the link.");
      if (!profile) throw new StepFailure(NO_PROFILE);
      try {
        const scored = scoreJob(await importJob(run.jobUrl), profile, { keepAll: true })!;
        const job = toRunJob(scored, true);
        return { status: "done", message: `${scored.title} at ${scored.company} — ${scored.score}% match.`, apply: (r) => void (r.jobs = [job]) };
      } catch (err) {
        if (err instanceof ImportError) throw new StepFailure(err.message);
        throw err;
      }
    }

    case "companies.insights": {
      // Culture and stated pay arrived with the jobs; this step reports honestly how much there is…
      const rated = jobs.filter((j) => j.insights?.rating !== undefined);
      const paid = jobs.filter((j) => j.insights?.salaryLpa);
      const parts: string[] = [];
      if (rated.length) {
        const ratings = rated.map((j) => j.insights!.rating!);
        const range = Math.min(...ratings) !== Math.max(...ratings) ? `${Math.min(...ratings)}–${Math.max(...ratings)}` : `${ratings[0]}`;
        parts.push(`Employee ratings for ${rated.length} of ${plural(jobs.length, "job")} (${range} out of 5).`);
      } else {
        parts.push(`No employee ratings for ${jobs.length === 1 ? "this job" : `these ${jobs.length} jobs`} (only some Hirist listings carry them).`);
      }
      parts.push(paid.length ? `Salary stated for ${paid.length}: ${paid.slice(0, 3).map((j) => `${j.company} ${formatSalary(j.insights!.salaryLpa!)}`).join(", ")}.` : "None of them state a salary.");

      // …and works out what to ask for: from a job's own stated pay, else from what similar roles publish.
      let market: MarketRange | null = null;
      if (profile) {
        try {
          market = (await salaryMarket(profile)).range;
        } catch (err) {
          console.warn("[automations] salary market unavailable:", err instanceof Error ? err.message : err);
        }
      }
      const own = { currentCtcLpa: profile?.currentCtcLpa, minSalaryLpa: profile?.minSalaryLpa };
      const asks = new Map<string, Pick<JobInsights, "askLpa" | "askFloorLpa" | "askBasis">>();
      for (const j of jobs) {
        const posted = j.insights?.salaryLpa;
        const advice = posted
          ? recommendAsk({ ...own, posted, postedBandPosition: bandPosition(profile?.experienceYears ?? 0, j.minExperience, j.maxExperience) })
          : recommendAsk({ ...own, market });
        if (advice) asks.set(j.id, { askLpa: advice.ask, askFloorLpa: advice.floor, askBasis: posted ? "posting" : market ? "market" : "personal" });
      }
      if (market) parts.push(`Similar roles that publish pay offer ${market.low}–${market.high} LPA (${market.postings} postings), about ${market.typical} LPA at your experience.`);
      else parts.push("Not enough published pay for similar roles yet to give a market range.");
      if (asks.size) parts.push(`What to ask for is shown on ${asks.size === jobs.length ? "each job" : `${asks.size} of the jobs`}.`);

      return {
        status: "done",
        message: parts.join(" "),
        apply: (r) => {
          r.jobs = r.jobs.map((j) => (asks.has(j.id) ? { ...j, insights: { ...(j.insights ?? { benefits: [] }), ...asks.get(j.id) } } : j));
        },
      };
    }

    case "workflow.approval":
      if (!jobs.length) return { status: "skipped", message: "Nothing to approve." };
      return { status: "waiting", message: `Waiting for you to review ${plural(jobs.length, "job")}.` };

    case "tracker.add": {
      if (!jobs.length) return { status: "skipped", message: "No jobs to add." };
      const ids = jobs.map((j) => j.id);
      return {
        status: "done",
        message: `${plural(jobs.length, "job")} queued for your Tracker. They appear the next time Offerloop is open.`,
        apply: (r) => {
          r.trackerJobIds = ids;
          r.trackerApplied = false;
        },
      };
    }

    case "hirist.apply": {
      // The server can't use the user's Hirist login: approved jobs go to a queue that the
      // job agent on their PC works through, in their own logged-in Chrome.
      const max = Math.max(1, Math.min(DAILY_APPLY_LIMIT, Number(settings.max ?? DAILY_APPLY_LIMIT)));
      // Jobs "Tailor my resume" made a resume for: the agent applies with that one.
      const tailoredFor = new Map((run.tailored ?? []).filter((t) => t.status === "done" && t.versionId).map((t) => [t.jobId, t.versionId!]));
      const queueJobs = jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, source: j.source, resumeVersionId: tailoredFor.get(j.id) }));
      return {
        status: "done",
        message: "Queued for your job agent.",
        apply: (r, data) => {
          const result = enqueue(data.applyQueue, queueJobs, { id: r.id, workflowName: r.workflowName }, { max, uid: newUid });
          const parts: string[] = [];
          if (result.added.length) {
            parts.push(
              `${plural(result.added.length, "Hirist job")} queued for your job agent` +
                (result.added.some((a) => a.resumeVersionId) ? ` (${result.added.filter((a) => a.resumeVersionId).length} with their tailored resume)` : "") +
                (data.agent ? "." : " — connect the agent on your PC (Automations → Hirist agent) to apply."),
            );
          } else {
            parts.push("No new Hirist jobs to apply to.");
          }
          if (result.duplicates.length) {
            // Say where each one already is, so "nothing new" doesn't read as "nothing happened".
            const where = (job: (typeof result.duplicates)[number]) =>
              data.applyQueue.find((q) => q.hiristId === hiristIdOf(job) && q.status !== "failed" && q.status !== "removed")?.status;
            const count = (...statuses: string[]) => result.duplicates.filter((j) => statuses.includes(where(j) ?? "")).length;
            const states = [
              [count("queued", "in_progress"), "still waiting for your PC agent"],
              [count("applied", "already_applied"), "already applied"],
              [count("needs_input"), "need you to finish on Hirist"],
              [count("skipped"), "apply on the company's site"],
            ] as const;
            const said = states.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
            parts.push(`Already in your queue from an earlier run: ${said.join(", ")}.`);
          }
          if (result.notHirist.length) parts.push(`${plural(result.notHirist.length, "job")} from career pages: apply on the company's site.`);
          const extra = jobs.length - result.added.length - result.duplicates.length - result.notHirist.length;
          if (extra > 0) parts.push(`${extra} more over this step's limit of ${max}.`);
          return parts.join(" ");
        },
      };
    }

    case "resume.tailor":
      return tailorResumes(ctx, Math.max(1, Math.min(10, Number(settings.max ?? 5))));

    case "dsa.questions": {
      if (!jobs.length) return { status: "skipped", message: "No jobs to prepare for." };
      const companies = [...new Set(jobs.map((j) => j.company))];
      return { status: "done", message: `Open DSA Prep for question lists: ${companies.slice(0, 6).join(", ")}${companies.length > 6 ? "…" : ""}.` };
    }

    case "workflow.summary": {
      // Full sentences: this line is read on its own, on the dashboard.
      const parts: string[] = [];
      if (!run.jobs.length) {
        parts.push(run.startedBy === "schedule" ? "No new matching jobs since the last run." : "No matching jobs found.");
      } else {
        parts.push(`Found ${plural(run.jobs.length, "job")}.`);
        if (run.approvedJobIds) parts.push(jobs.length ? `You approved ${jobs.length}.` : "You approved none of them.");
        const tailored = run.tailored?.filter((t) => t.status === "done").length ?? 0;
        if (tailored) parts.push(`${tailored} tailored ${tailored === 1 ? "resume is" : "resumes are"} ready to review.`);
        const tracked = run.trackerJobIds?.length ?? 0;
        if (tracked) parts.push(`${tracked} ${tracked === 1 ? "was" : "were"} added to your Tracker.`);
      }
      // Only steps skipped because their tool isn't connected — not ones that simply had nothing to do.
      const notConnected = run.steps.filter((s) => s.status === "skipped" && NOT_CONNECTED[s.actionId]).length;
      if (notConnected) parts.push(`${plural(notConnected, "step")} didn't run because ${notConnected === 1 ? "that tool isn't" : "those tools aren't"} connected yet.`);
      return { status: "done", message: parts.join(" ") };
    }

    default:
      return { status: "skipped", message: "Skipped: this step isn't available." };
  }
}

/* ── Tailoring ────────────────────────────────────────── */

/** Longest a single resume may take before it's given up on. */
const ONE_RESUME_LIMIT_MS = 5 * 60_000;

/** The posting's full description, read from its page (Hirist and the job boards' APIs). */
async function jobDescription(job: RunJob): Promise<string> {
  let description = "";
  try {
    description = (await importJob(job.url)).description?.trim() ?? "";
  } catch (err) {
    console.warn(`[automations] couldn't read the description of ${job.url}:`, err instanceof Error ? err.message : err);
  }
  return description;
}

/**
 * Tailor the resume saved in Resume Studio to each job (the approved ones, after "Wait for my
 * approval"), one at a time. Each result is saved as soon as it's ready, so a restart carries
 * on from the next job; a job that fails doesn't stop the others, and the run goes on to
 * apply either way.
 */
async function tailorResumes(ctx: StepContext, max: number): Promise<StepOutcome> {
  const { run, uid, llm } = ctx;
  const approvalLater = run.steps.slice(run.cursor + 1).some((s) => s.actionId === "workflow.approval");
  if (approvalLater && run.jobs.length > 1) {
    return {
      status: "skipped",
      message: "Skipped: this step comes before “Wait for my approval”. Edit the workflow and move “Tailor my resume” below it, so only the jobs you approve are tailored.",
    };
  }
  if (!llm) return { status: "skipped", message: "Skipped: add your AI key on the Automations page (“AI for tailoring”) first." };

  const done = new Set((run.tailored ?? []).filter((t) => t.status === "done").map((t) => t.jobId));
  const jobs = activeJobs(run).slice(0, max);
  const todo = jobs.filter((j) => !done.has(j.id));
  let made = jobs.length - todo.length;
  const failures: string[] = [];

  /** Save one result on the run right away; false if the run was cancelled meanwhile. */
  const save = (item: TailoredResume, progress: string) =>
    updateStore(uid, (d) => {
      const r = d.runs.find((x) => x.id === run.id);
      if (!r || r.status !== "running") return false;
      r.tailored = [...(r.tailored ?? []).filter((t) => t.jobId !== item.jobId), item];
      const state = r.steps[run.cursor];
      if (state?.status === "running") state.message = progress;
      return true;
    });

  for (const [i, job] of todo.entries()) {
    const base = { jobId: job.id, title: job.title, company: job.company, url: job.url, at: new Date().toISOString() };
    let item: TailoredResume;
    const description = await jobDescription(job);
    if (description.length < 80) {
      item = { ...base, status: "failed", message: "Couldn't read this posting's description, so there was nothing to tailor to." };
    } else {
      const jdText = `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n\n${description}`;
      try {
        let result;
        try {
          result = await tailorForJob(llm, uid, { jdText, title: job.title, company: job.company, url: job.url }, { signal: AbortSignal.timeout(ONE_RESUME_LIMIT_MS) });
        } catch (err) {
          // Free AI plans allow only a few requests a minute: wait once, then try again.
          if (!(err instanceof Error && /rate limit|quota/i.test(err.message))) throw err;
          await new Promise((r) => setTimeout(r, 60_000));
          result = await tailorForJob(llm, uid, { jdText, title: job.title, company: job.company, url: job.url }, { signal: AbortSignal.timeout(ONE_RESUME_LIMIT_MS) });
        }
        made++;
        item = {
          ...base,
          status: "done",
          versionId: result.versionId,
          atsBefore: result.atsBefore,
          atsAfter: result.atsAfter,
          changes: result.changes,
          message: description.length < 400 ? "The posting's description was short, so there was less to tailor to." : undefined,
        };
      } catch (err) {
        if (err instanceof NoResumeError) return { status: "skipped", message: `Skipped: ${err.message}` };
        const reason = err instanceof Error ? err.message : String(err);
        item = { ...base, status: "failed", message: reason.slice(0, 300) };
      }
    }
    if (item.status === "failed") failures.push(item.message ?? "failed");
    const progress = `Tailored ${made} of ${jobs.length}${i + 1 < todo.length ? "… working on the next one" : ""}.`;
    if (!(await save(item, progress))) return { status: "skipped", message: "Stopped: the run was cancelled." };
  }

  const failed = failures.length;
  return {
    status: "done",
    message:
      `Tailored ${plural(made, "resume")} to ${made === 1 ? "its job's" : "their jobs'"} descriptions` +
      (failed ? `; ${failed} couldn't be tailored (${failures[0].replace(/\.$/, "")})` : "") +
      ". Open “Tailored resumes” on this run to compare each one with its job.",
  };
}

/* ── Run lifecycle ────────────────────────────────────── */

const finish = (run: WorkflowRun, status: WorkflowRun["status"], error?: string) => {
  run.status = status;
  run.finishedAt = new Date().toISOString();
  if (error) run.error = error;
};

/** No step should take this long; if one does, it fails with a message instead of spinning. */
const STEP_TIME_LIMIT_MS = 6 * 60_000;
/** Tailoring makes several AI calls per resume, one resume at a time (see tailorResumes). */
const TAILOR_TIME_LIMIT_MS = 30 * 60_000;

function withTimeLimit<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepFailure(`This step took over ${Math.round(ms / 60_000)} minutes and was stopped. Run it again.`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Runs this process is working on right now. A run marked "running" that isn't in here and
// hasn't moved for a while belongs to a process that's gone (a deploy or restart stopped it).
const g = globalThis as unknown as { __offerloopActiveRuns?: Set<string> };
const activeRuns = (g.__offerloopActiveRuns ??= new Set<string>());

interface Waiting {
  run: WorkflowRun;
  links?: MadeLinks;
  creds: SignalCreds | null;
}

/** Run steps from the cursor until the run finishes, fails, or has to wait for approval. */
async function advance(uid: string, runId: string): Promise<void> {
  activeRuns.add(runId);
  try {
    await advanceSteps(uid, runId);
  } finally {
    activeRuns.delete(runId);
  }
}

async function advanceSteps(uid: string, runId: string): Promise<void> {
  for (;;) {
    // 1. Claim the next step.
    const claim = await updateStore(uid, (data) => {
      const run = data.runs.find((r) => r.id === runId);
      if (!run || run.status !== "running") return null;
      const state = run.steps[run.cursor];
      if (!state) {
        finish(run, "completed");
        return null;
      }
      state.status = "running";
      state.startedAt = new Date().toISOString();
      const workflow = data.workflows.find((w) => w.id === run.workflowId);
      const step: WorkflowStep = workflow?.steps.find((s) => s.uid === state.uid) ?? { uid: state.uid, actionId: state.actionId, settings: {} };
      let llm: LlmConfig | null = null;
      if (step.actionId === "resume.tailor") {
        try {
          llm = automationLlm(data);
        } catch (err) {
          console.warn("[automations] couldn't read the AI key:", err instanceof Error ? err.message : err);
        }
      }
      const ctx: StepContext = {
        uid,
        llm,
        run: structuredClone(run),
        profile: data.profile,
        seenJobIds: [...(data.seenJobs[run.workflowId] ?? [])],
        handledHiristIds: new Set(data.applyQueue.filter((q) => q.status !== "failed" && q.status !== "removed").map((q) => q.hiristId)),
      };
      return { step, ctx, cursor: run.cursor };
    });
    if (!claim) return;

    // 2. Do the work without holding the store.
    let outcome: StepOutcome | null = null;
    let failure: string | null = null;
    try {
      const needsJobs = ACTION_BY_ID[claim.step.actionId]?.needs.includes("job");
      outcome =
        needsJobs && !activeJobs(claim.ctx.run).length
          ? { status: "skipped", message: "No jobs to work on." }
          : await withTimeLimit(runStep(claim.step, claim.ctx), claim.step.actionId === "resume.tailor" ? TAILOR_TIME_LIMIT_MS : STEP_TIME_LIMIT_MS);
    } catch (err) {
      failure = err instanceof StepFailure ? err.message : "This step hit an unexpected error.";
      if (!(err instanceof StepFailure)) console.error(`[automations] ${claim.step.actionId} failed:`, err);
    }

    // 3. Record the result — unless the run was cancelled or replaced while the step worked.
    let nowWaiting: Waiting | null = null;
    const more = await updateStore(uid, (data) => {
      const run = data.runs.find((r) => r.id === runId);
      if (!run || run.status !== "running" || run.cursor !== claim.cursor) return false;
      const state = run.steps[run.cursor];
      if (failure !== null || !outcome) {
        state.status = "failed";
        state.message = failure ?? "This step hit an unexpected error.";
        finish(run, "failed", state.message);
        return false;
      }
      const message = outcome.apply?.(run, data);
      state.status = outcome.status;
      state.message = typeof message === "string" ? message : outcome.message;
      if (outcome.status === "waiting") {
        run.status = "waiting_approval";
        // One-tap approve links go in the Signal message, so only make them when it's set up.
        const creds = signalCreds(data);
        let links: MadeLinks | undefined;
        if (creds && run.jobs.length) {
          const made = makeApprovalLinks(data.approvalLinks, run);
          data.approvalLinks = made.links;
          links = made.made;
        }
        nowWaiting = { run: structuredClone(run), links, creds };
        return false;
      }
      run.cursor++;
      return true;
    });
    // Waiting for you: say so on Signal too (when it's set up), so you can approve from your phone.
    // (Set inside the callback above, which TypeScript can't follow.)
    const waiting = nowWaiting as Waiting | null;
    if (waiting?.creds) notifyWaiting(uid, waiting.creds, waiting.run, waiting.links);
    if (!more) return;
  }
}

/** Send a waiting run's Signal message again, with fresh links (the old ones stop working). */
export async function resendApproval(uid: string, runId: string): Promise<SignalResult> {
  const site = siteUrl();
  const made = await updateStore(uid, (data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (!run || run.status !== "waiting_approval") throw new StepFailure("That run isn't waiting for approval any more.");
    const creds = signalCreds(data);
    if (!creds) throw new StepFailure("Signal isn't set up yet: add your CallMeBot details first.");
    const { links, made } = makeApprovalLinks(data.approvalLinks, run);
    data.approvalLinks = links;
    return { run: structuredClone(run), links: made, creds };
  });
  if (!site) throw new StepFailure("The site's address isn't known (set PUBLIC_URL).");
  await indexLinks(uid, made.links);
  return sendApproval(uid, made.creds, made.run, site, made.links);
}

const siteUrl = () => configuredSite();

/** Record which person each link belongs to, so /a/<token> can find their run. */
async function indexLinks(uid: string, links: MadeLinks) {
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  for (const token of [links.all, links.skip, ...links.single.map((s) => s.token)]) {
    await indexSet("approval-links", linkHash(token), { uid, expiresAt });
  }
}

/**
 * Send the approval message. CallMeBot sometimes can't deliver a long, link-heavy message
 * ("Internal Signal Error") while short ones go through — then send the short version.
 */
async function sendApproval(uid: string, creds: SignalCreds, run: WorkflowRun, site: string, links?: MadeLinks): Promise<SignalResult> {
  const full = await sendAndRecord(uid, creds, "approval", approvalMessage(run, site, links));
  if (full.ok) return full;
  const short = await sendAndRecord(uid, creds, "approval", shortApprovalMessage(run, site, links));
  return short.ok ? { ...short, detail: `Sent the short version (the full one failed). ${short.detail}` } : short;
}

function notifyWaiting(uid: string, creds: SignalCreds, run: WorkflowRun, links?: MadeLinks) {
  if (!run.jobs.length) return;
  const site = siteUrl();
  if (!site) {
    // Without the site's address the links can't be built; say so where it's visible.
    void updateStore(uid, (d) => {
      d.signalLast = { ok: false, at: new Date().toISOString(), kind: "approval", detail: "Not sent: the site's address isn't known. Add PUBLIC_URL (e.g. https://offerloop-xxxx.onrender.com) in Render → Environment." };
    }).catch(() => {});
    return;
  }
  void (async () => {
    if (links) await indexLinks(uid, links);
    await sendApproval(uid, creds, run, site, links);
  })().catch((err) => console.error("[signal] approval message failed:", err));
}

const background = (uid: string, runId: string) => void advance(uid, runId).catch((err) => console.error("[automations] run crashed:", err));

/** Start a run and return straight away; the steps continue in the background. */
export async function startRun(uid: string, workflowId: string, startedBy: WorkflowRun["startedBy"], input: { jobUrl?: string } = {}): Promise<WorkflowRun> {
  const run = await updateStore(uid, (data) => {
    const workflow = data.workflows.find((w) => w.id === workflowId);
    if (!workflow) throw new StepFailure("That workflow doesn't exist any more.");
    if (!workflow.steps.length) throw new StepFailure("This workflow has no steps yet.");
    // A new run replaces one still in progress or waiting, so stale approvals don't pile up.
    for (const old of data.runs) {
      if (old.workflowId === workflowId && (old.status === "waiting_approval" || old.status === "running")) finish(old, "cancelled", "Replaced by a newer run.");
    }
    const created: WorkflowRun = {
      id: newUid(),
      workflowId,
      workflowName: workflow.name,
      startedBy,
      status: "running",
      startedAt: new Date().toISOString(),
      steps: workflow.steps.map<RunStep>((s) => ({ uid: s.uid, actionId: s.actionId, status: "pending" })),
      cursor: 0,
      jobUrl: input.jobUrl,
      jobs: [],
    };
    data.runs.unshift(created);
    return created;
  });
  background(uid, run.id);
  return run;
}

/** The user approved some (or none) of the jobs: continue with those. */
export async function approveRun(uid: string, runId: string, jobIds: string[]): Promise<void> {
  await updateStore(uid, (data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (!run || run.status !== "waiting_approval") throw new StepFailure("That run isn't waiting for approval any more.");
    const approved = run.jobs.filter((j) => jobIds.includes(j.id));
    const valid = approved.map((j) => j.id);
    run.approvedJobIds = valid;
    // The tools these jobs ask for that you don't have yet go on your Learn list.
    const toLearn = addToLearn(data.learning, approved);
    const state = run.steps[run.cursor];
    state.status = "done";
    state.message =
      `You approved ${valid.length} of ${plural(run.jobs.length, "job")}.` +
      (toLearn.length ? ` New to learn: ${toLearn.slice(0, 6).join(", ")}${toLearn.length > 6 ? ` +${toLearn.length - 6} more` : ""} — see Learn.` : "");
    run.cursor++;
    run.status = "running";
  });
  background(uid, runId);
}

export async function cancelRun(uid: string, runId: string): Promise<void> {
  await updateStore(uid, (data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (run && (run.status === "running" || run.status === "waiting_approval")) finish(run, "cancelled", "Cancelled by you.");
  });
}

/** The browser has added a run's jobs to the Tracker. */
export async function markTrackerApplied(uid: string, runId: string): Promise<void> {
  await updateStore(uid, (data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (run) run.trackerApplied = true;
  });
}

/** The browser has put these Hirist apply results on the Tracker. */
export async function markApplySynced(uid: string, itemIds: string[]): Promise<void> {
  await updateStore(uid, (data) => {
    for (const item of data.applyQueue) if (itemIds.includes(item.id)) item.trackerSynced = true;
  });
}

/** Longer than any step may run (STEP_TIME_LIMIT_MS): one "running" this long was cut off. */
export const STUCK_AFTER_MS = 7 * 60_000;

/**
 * Pick up runs a restart cut off mid-step. Render starts the new server before stopping the old
 * one, so "running" at startup doesn't mean dead — only a step that hasn't moved for
 * STUCK_AFTER_MS, in a run no live process here is working on, is. Such a run gets its step
 * started again, once; cut off a second time, it fails with a message instead of spinning forever.
 * Called on every scheduler tick.
 */
export async function recoverStuckRuns(uid: string, now = Date.now()): Promise<number> {
  const stuck = (run: WorkflowRun) => {
    if (run.status !== "running" || activeRuns.has(run.id)) return false;
    const since = Date.parse(run.steps[run.cursor]?.startedAt ?? run.startedAt);
    return Number.isFinite(since) && now - since > STUCK_AFTER_MS;
  };
  if (!(await readStore(uid)).runs.some(stuck)) return 0;
  const resume = await updateStore(uid, (d) => {
    const ids: string[] = [];
    for (const run of d.runs) {
      if (!stuck(run)) continue;
      const step = run.steps[run.cursor];
      if ((run.restarts ?? 0) >= 1) {
        if (step?.status === "running") {
          step.status = "failed";
          step.message = "Cut off by a server restart twice.";
        }
        finish(run, "failed", "Interrupted by server restarts. Run it again.");
        continue;
      }
      run.restarts = (run.restarts ?? 0) + 1;
      if (step?.status === "running") {
        step.status = "pending";
        step.message = "Starting again: a server restart cut this step off.";
      }
      ids.push(run.id);
    }
    return ids;
  });
  for (const id of resume) {
    console.log(`[automations] picking up run ${id} after a restart cut it off`);
    background(uid, id);
  }
  return resume.length;
}

export { StepFailure };
