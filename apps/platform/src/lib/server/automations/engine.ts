// Server only. Runs a workflow: one step at a time, saved after every step, paused at
// "Wait for my approval" until the user approves. Closing the browser changes nothing.
//
// Each step is: claim it (quick, through the store queue) → do the work (slow, outside the
// queue, so progress checks never wait behind a 10-second job search) → record the result.
import { formatSalary, insightsFor, type JobInsights } from "@/lib/company-info";
import { scoreJob, type ScoredJob, type SearchProfile } from "@/lib/jobs";
import { DAILY_APPLY_LIMIT, enqueue, hiristIdOf } from "@/lib/apply-queue";
import { approvalMessage } from "@/lib/approval-message";
import { addToLearn } from "@/lib/learn";
import { makeApprovalLinks, type MadeLinks } from "@/lib/server/approval-links";
import { sendAndRecord, signalConfigured, trySendSignal, type SignalResult } from "@/lib/server/notify/signal";
import { ACTION_BY_ID, newUid, type RunJob, type RunStep, type WorkflowRun, type WorkflowStep } from "@/lib/workflow-defs";
import { bandPosition, recommendAsk, type MarketRange } from "@/lib/salary";
import { ImportError, importJob } from "../jobs/import";
import { salaryMarket } from "../jobs/market";
import { searchJobs } from "../jobs/search";
import { readStore, updateStore, type StoreData } from "../store";

interface StepOutcome {
  status: "done" | "skipped" | "waiting";
  message: string;
  /** Changes to save with the result (applied inside the store queue). May return the final message. */
  apply?: (run: WorkflowRun, data: StoreData) => string | void;
}

interface StepContext {
  run: WorkflowRun;
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
  "resume.tailor": "Skipped: tailoring needs your AI key and your review, so do it in Resume Studio for the jobs you keep.",
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
      const queueJobs = jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, source: j.source }));
      return {
        status: "done",
        message: "Queued for your job agent.",
        apply: (r, data) => {
          const result = enqueue(data.applyQueue, queueJobs, { id: r.id, workflowName: r.workflowName }, { max, uid: newUid });
          const parts: string[] = [];
          if (result.added.length) {
            parts.push(
              `${plural(result.added.length, "Hirist job")} queued for your job agent` +
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

/* ── Run lifecycle ────────────────────────────────────── */

const finish = (run: WorkflowRun, status: WorkflowRun["status"], error?: string) => {
  run.status = status;
  run.finishedAt = new Date().toISOString();
  if (error) run.error = error;
};

/** No step should take this long; if one does, it fails with a message instead of spinning. */
const STEP_TIME_LIMIT_MS = 6 * 60_000;

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

/** Run steps from the cursor until the run finishes, fails, or has to wait for approval. */
async function advance(runId: string): Promise<void> {
  activeRuns.add(runId);
  try {
    await advanceSteps(runId);
  } finally {
    activeRuns.delete(runId);
  }
}

async function advanceSteps(runId: string): Promise<void> {
  for (;;) {
    // 1. Claim the next step.
    const claim = await updateStore((data) => {
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
      const ctx: StepContext = {
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
          : await withTimeLimit(runStep(claim.step, claim.ctx), STEP_TIME_LIMIT_MS);
    } catch (err) {
      failure = err instanceof StepFailure ? err.message : "This step hit an unexpected error.";
      if (!(err instanceof StepFailure)) console.error(`[automations] ${claim.step.actionId} failed:`, err);
    }

    // 3. Record the result — unless the run was cancelled or replaced while the step worked.
    let nowWaiting: { run: WorkflowRun; links?: MadeLinks } | null = null;
    const more = await updateStore((data) => {
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
        let links: MadeLinks | undefined;
        if (signalConfigured() && run.jobs.length) {
          const made = makeApprovalLinks(data.approvalLinks, run);
          data.approvalLinks = made.links;
          links = made.made;
        }
        nowWaiting = { run: structuredClone(run), links };
        return false;
      }
      run.cursor++;
      return true;
    });
    // Waiting for you: say so on Signal too (when it's set up), so you can approve from your phone.
    // (Set inside the callback above, which TypeScript can't follow.)
    const waiting = nowWaiting as { run: WorkflowRun; links?: MadeLinks } | null;
    if (waiting) notifyWaiting(waiting.run, waiting.links);
    if (!more) return;
  }
}

/** Send a waiting run's Signal message again, with fresh links (the old ones stop working). */
export async function resendApproval(runId: string): Promise<SignalResult> {
  const site = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  const made = await updateStore((data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (!run || run.status !== "waiting_approval") throw new StepFailure("That run isn't waiting for approval any more.");
    const { links, made } = makeApprovalLinks(data.approvalLinks, run);
    data.approvalLinks = links;
    return { run: structuredClone(run), links: made };
  });
  if (!site) throw new StepFailure("The site's address isn't known (set PUBLIC_URL).");
  return sendAndRecord("approval", approvalMessage(made.run, site, made.links));
}

function notifyWaiting(run: WorkflowRun, links?: MadeLinks) {
  const site = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  if (!site || !run.jobs.length) return;
  void trySendSignal(approvalMessage(run, site, links));
}

const background = (runId: string) => void advance(runId).catch((err) => console.error("[automations] run crashed:", err));

/** Start a run and return straight away; the steps continue in the background. */
export async function startRun(workflowId: string, startedBy: WorkflowRun["startedBy"], input: { jobUrl?: string } = {}): Promise<WorkflowRun> {
  const run = await updateStore((data) => {
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
  background(run.id);
  return run;
}

/** The user approved some (or none) of the jobs: continue with those. */
export async function approveRun(runId: string, jobIds: string[]): Promise<void> {
  await updateStore((data) => {
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
  background(runId);
}

export async function cancelRun(runId: string): Promise<void> {
  await updateStore((data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (run && (run.status === "running" || run.status === "waiting_approval")) finish(run, "cancelled", "Cancelled by you.");
  });
}

/** The browser has added a run's jobs to the Tracker. */
export async function markTrackerApplied(runId: string): Promise<void> {
  await updateStore((data) => {
    const run = data.runs.find((r) => r.id === runId);
    if (run) run.trackerApplied = true;
  });
}

/** The browser has put these Hirist apply results on the Tracker. */
export async function markApplySynced(itemIds: string[]): Promise<void> {
  await updateStore((data) => {
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
export async function recoverStuckRuns(now = Date.now()): Promise<number> {
  const stuck = (run: WorkflowRun) => {
    if (run.status !== "running" || activeRuns.has(run.id)) return false;
    const since = Date.parse(run.steps[run.cursor]?.startedAt ?? run.startedAt);
    return Number.isFinite(since) && now - since > STUCK_AFTER_MS;
  };
  if (!(await readStore()).runs.some(stuck)) return 0;
  const resume = await updateStore((d) => {
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
    background(id);
  }
  return resume.length;
}

export { StepFailure };
