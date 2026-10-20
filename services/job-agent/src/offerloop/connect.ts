// Works through the Hirist jobs you approved on Offerloop, one at a time, in your own
// logged-in Chrome — then reports each result back so the Tracker updates.
//
// Everything outside this file (Offerloop, Chrome, Hirist) comes in as `deps`, so the loop
// is tested with fakes (checkConnect.ts).

import type { ApplyResult } from "../application/application.js";
import type { DetailedJob } from "../hirist/getJobDetails.js";
import type { OfferloopClient, QueueStatus, QueuedJob } from "./client.js";

export type Outcome = { status: QueueStatus; message: string; stop?: string };

/** What an apply attempt means for the queue — and whether to stop the whole batch. */
export function outcomeOf(result: ApplyResult): Outcome {
  const extra = result.message ? ` (${result.message})` : "";
  switch (result.status) {
    case "APPLIED":
      return { status: "applied", message: "Applied on Hirist." };
    case "ALREADY_APPLIED":
      return { status: "already_applied", message: "Hirist shows you already applied." };
    case "QUESTIONNAIRE":
      return { status: "needs_input", message: "Hirist asks screening questions — open the job and finish applying there." };
    case "DRY_RUN":
      return { status: "requeue", message: "Dry run: the Apply button was found; nothing was submitted." };
    case "AUTH_REQUIRED":
      return { status: "requeue", message: "Not logged in to Hirist.", stop: "Hirist logged you out. Log in again in the agent's Chrome, then rerun." };
  }
  switch (result.reason) {
    case "HUMAN_REQUIRED":
      return {
        status: "needs_input",
        message: "Hirist showed a CAPTCHA or verification — finish this one by hand.",
        stop: "Hirist asked for a CAPTCHA or verification. Stopping for today so the account isn't flagged.",
      };
    case "PROFILE_INCOMPLETE":
      return {
        status: "needs_input",
        message: "Hirist wants your profile completed first.",
        stop: "Complete your Hirist profile (Hirist redirected to registration), then rerun.",
      };
    case "EXTERNAL_REDIRECT":
    case "LIVE_RECLASSIFIED":
      return { status: "skipped", message: "This job is applied for on the company's own site, not on Hirist." };
    case "IDENTITY_MISMATCH":
    case "DIRECT_CONTROL_MISSING":
      return { status: "failed", message: `Couldn't find this job's Apply button on Hirist; nothing was clicked${extra}.` };
    default:
      // Apply was clicked but the result is unclear.
      return { status: "needs_input", message: `Apply was clicked but Hirist's answer was unclear — check the job on Hirist${extra}.` };
  }
}

export type ConnectDeps = {
  offerloop: OfferloopClient;
  /** Chrome attached and logged in to Hirist (waits for a manual login if needed). */
  ensureReady: () => Promise<void>;
  /** Fresh details for one Hirist job, or null if it's gone. */
  details: (job: QueuedJob) => Promise<DetailedJob | null>;
  apply: (job: DetailedJob, dryRun: boolean) => Promise<ApplyResult>;
  /**
   * Swapping resumes on your Hirist profile (Hirist's Apply sends the profile's resume):
   * `put` uploads the resume tailored to a job, `restore` puts your main resume back.
   * Absent when it isn't set up (`npm run resume:setup`): jobs go with your profile resume.
   */
  resume?: { put: (job: QueuedJob) => Promise<void>; restore: () => Promise<void> };
  /** Pause between applications, so it looks like a person, not a script. */
  pause: () => Promise<void>;
  log: (line: string) => void;
};

export type ConnectSummary = {
  done: number;
  byStatus: Partial<Record<QueueStatus, number>>;
  /** Each job handled in this pass, in order (for the Windows notification). */
  results: { title: string; company: string; status: QueueStatus }[];
  stoppedBecause?: string;
};

/** One pass through the approved jobs. Live mode takes one job at a time; dry runs look at all and put them back. */
export async function runConnectOnce(deps: ConnectDeps, { dryRun }: { dryRun: boolean }): Promise<ConnectSummary> {
  const { offerloop, log } = deps;
  const summary: ConnectSummary = { done: 0, byStatus: {}, results: [] };
  const hello = await offerloop.hello();
  if (!hello.queued) {
    log("Nothing approved is waiting. Approve Hirist jobs in an Offerloop workflow first.");
    return summary;
  }
  if (!hello.remainingToday) {
    log(`Today's limit of ${hello.dailyLimit} applications is used up; ${hello.queued} job(s) will wait until tomorrow.`);
    return summary;
  }
  log(`${hello.queued} approved job(s) waiting; up to ${hello.remainingToday} more today.`);
  await deps.ensureReady();

  const batch = dryRun ? (await offerloop.take(hello.remainingToday)).jobs : [];
  // True while your Hirist profile holds a tailored resume instead of your main one.
  let swapped = false;
  const restore = async () => {
    if (!swapped || !deps.resume) return;
    await deps.resume.restore();
    swapped = false;
    log("  Put your main resume back on your Hirist profile.");
  };
  try {
    for (let first = true; ; first = false) {
      const job = dryRun ? batch.shift() : (await offerloop.take(1)).jobs[0];
      if (!job) break;
      if (!first && !dryRun) await deps.pause();
      log(`\n→ ${job.title} — ${job.company}\n  ${job.url}`);

      let outcome: Outcome;
      try {
        const detailed = await deps.details(job);
        if (!detailed) outcome = { status: "failed", message: "Hirist says this job is gone or unavailable." };
        else if (detailed.applicationType !== "HIRIST_DIRECT") {
          outcome = {
            status: "skipped",
            message: detailed.externalApplicationUrl
              ? `Applied for on the company's site: ${detailed.externalApplicationUrl}`
              : `Not a one-click Hirist job (${detailed.applicationLabel ?? detailed.applicationType}).`,
          };
        } else {
          const resume = dryRun ? { use: "profile" as const } : await chooseResume(job);
          if (resume.use === "stop") outcome = { status: "requeue", message: "Put back: your Hirist resume couldn't be set.", stop: resume.why };
          else {
            outcome = outcomeOf(await deps.apply(detailed, dryRun));
            if (outcome.status === "applied" || outcome.status === "needs_input") outcome.message += resumeNote(resume);
          }
        }
      } catch (error) {
        // We can't tell whether Apply was clicked: let the person check rather than retry blindly.
        outcome = {
          status: "needs_input",
          message: `Something went wrong mid-way (${error instanceof Error ? error.message.slice(0, 120) : error}) — check the job on Hirist.`,
        };
      }

      await offerloop.report(job.id, outcome.status, outcome.message);
      summary.done++;
      summary.byStatus[outcome.status] = (summary.byStatus[outcome.status] ?? 0) + 1;
      summary.results.push({ title: job.title, company: job.company, status: outcome.status });
      log(`  ${outcome.status.replace("_", " ")}: ${outcome.message}`);

      if (outcome.stop) {
        summary.stoppedBecause = outcome.stop;
        // Put back anything already taken in this pass.
        for (const rest of batch.splice(0)) await offerloop.report(rest.id, "requeue", "Put back: the agent stopped.");
        log(`\nStopped: ${outcome.stop}`);
        break;
      }
    }
  } finally {
    // Never leave a job's tailored resume on your profile.
    try {
      await restore();
    } catch (error) {
      const why = `Your Hirist profile still has the last job's tailored resume: putting your main resume back failed (${error instanceof Error ? error.message : error}). Upload it on Hirist by hand.`;
      summary.stoppedBecause ??= why;
      log(`\n${why}`);
    }
  }
  return summary;

  type ResumeChoice = { use: "tailored" } | { use: "profile"; note?: string } | { use: "stop"; why: string };

  /** Which resume this job goes with, and get the profile ready for it. */
  async function chooseResume(job: QueuedJob): Promise<ResumeChoice> {
    if (job.tailoredResume && !deps.resume) {
      return { use: "profile", note: "Its tailored resume wasn't used: run `npm run resume:setup` on your PC to apply with tailored resumes." };
    }
    if (!deps.resume) return { use: "profile" };
    if (job.tailoredResume) {
      try {
        await deps.resume.put(job);
        swapped = true;
        log("  Put the resume tailored to this job on your Hirist profile.");
        return { use: "tailored" };
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        log(`  Couldn't put the tailored resume on Hirist: ${why}`);
        // The profile may still hold another job's resume: put the main one back first.
        try {
          await restore();
        } catch (restoreError) {
          return { use: "stop", why: `Couldn't set your resume on Hirist (${restoreError instanceof Error ? restoreError.message : restoreError}). Check your Hirist profile's resume, then rerun.` };
        }
        return { use: "profile", note: `Its tailored resume couldn't be uploaded (${why.slice(0, 120)}), so it went with your profile resume.` };
      }
    }
    // No tailored resume for this job: make sure your main one is on the profile.
    try {
      await restore();
    } catch (error) {
      return { use: "stop", why: `Couldn't put your main resume back on Hirist (${error instanceof Error ? error.message : error}). Check your Hirist profile's resume, then rerun.` };
    }
    return { use: "profile" };
  }
}

function resumeNote(choice: { use: string; note?: string }): string {
  if (choice.use === "tailored") return " Sent with the resume tailored to this job.";
  return "note" in choice && choice.note ? ` ${choice.note}` : "";
}
