// Tailoring a resume to a job description, in five steps:
//
//   analyze_jd        AI   What does the job want? (ATS keywords + aliases; cached per JD)
//   write_edits       AI   Propose edits: bullets, summary, skills, gap questions
//   recruiter_review  AI   A hiring manager's pass: keep, improve or drop each edit, add
//                          up to 3 for must-haves the profile backs (see review.ts)
//   check             code Check each edit against the master profile (flag, don't block)
//   score             code Apply the edits and compute the ATS score before → after
//
// Progress streams to the browser as events (status → jd_analysis → result), and
// every step's output is saved as the run's log (GET /tailor/threads/{id}/history).

import { atsScore } from "../lib/tailor/ats";
import { applyChanges } from "../lib/tailor/patch";
import type { Gap, JdAnalysis, MasterProfile, Resume, TailorEvent, TailorReviewSummary } from "../lib/tailor/types";
import { ask as askModel, type LlmConfig, type RunOptions } from "./models";
import * as prompts from "./prompts";
import { applyReview, draftForReview } from "./review";
import { JDAnalysis, TailorPlan, TailorReview, toChanges } from "./schemas";
import * as store from "./store";
import { supportedSkill, validateChanges } from "./validation";

/** Bump when the JD-analysis prompt/schema changes, to skip stale cache entries. */
const JD_ANALYSIS_VERSION = "v2";

export interface TailorInput {
  workspace: string;
  runId: string;
  jdText: string;
  resume: Resume;
  master: MasterProfile;
}

/** Drop duplicate gap questions and ones the master profile already answers. */
function usefulGaps(plan: TailorPlan, master: MasterProfile): Gap[] {
  const gaps: Gap[] = [];
  const seen = new Set<string>();
  for (const gap of plan.gaps) {
    const skill = gap.skill.trim();
    if (!skill || seen.has(skill.toLowerCase()) || supportedSkill(master, skill)) continue;
    seen.add(skill.toLowerCase());
    gaps.push({ id: `g${gaps.length + 1}`, skill, question: gap.question, importance: gap.importance });
  }
  return gaps;
}

export async function* runTailor(
  llm: LlmConfig,
  { workspace, runId, jdText, resume, master }: TailorInput,
  { signal, ask = askModel }: RunOptions = {},
): AsyncGenerator<TailorEvent> {
  const threadId = `${workspace}:tailor:${runId}`;
  const log: store.LogStep[] = [];
  const record = (node: string, state: unknown) =>
    log.push({ step: log.length, node, created_at: new Date().toISOString(), state });
  record("input", { jd_text: jdText, resume, master });

  try {
    // 1. analyze_jd
    yield { type: "status", stage: "analyzing", message: "Analyzing JD…" };
    const cacheKey = `${JD_ANALYSIS_VERSION}-${store.jdHash(jdText)}`;
    let jd = await store.getCachedJdAnalysis<JdAnalysis>(cacheKey);
    const cached = jd !== null;
    if (!jd) {
      jd = await ask(llm, JDAnalysis, prompts.jdAnalysis(jdText), { signal });
      await store.cacheJdAnalysis(cacheKey, jd);
    }
    record("analyze_jd", { jd_analysis: jd, jd_cached: cached });
    yield { type: "jd_analysis", jd_analysis: jd, cached };

    // 2. write_edits
    yield { type: "status", stage: "tailoring", message: "Tailoring resume…" };
    const plan = await ask(llm, TailorPlan, prompts.tailoring(jd, resume, master), { temperature: 0.2, signal });
    record("write_edits", { plan });

    // 3. recruiter_review — worth a second call only when there's a draft to review. If it
    // fails (rate limit, timeout), the draft is used as is: the review improves, never blocks.
    let edits = toChanges(plan);
    let review: TailorReviewSummary | undefined;
    if (edits.length) {
      yield { type: "status", stage: "reviewing", message: "Reviewing the edits like a recruiter…" };
      try {
        const verdict = await ask(llm, TailorReview, prompts.review(jd, resume, master, draftForReview(edits)), { temperature: 0.1, signal });
        ({ edits, summary: review } = applyReview(edits, verdict));
        record("recruiter_review", { verdict, review });
      } catch (err) {
        if (signal?.aborted) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        review = { notes: [], kept: edits.length, improved: 0, dropped: [], added: 0, skipped: reason };
        record("recruiter_review", { skipped: reason });
      }
    }

    // 4. check — the honesty rules, on the reviewed edits too
    yield { type: "status", stage: "validating", message: "Checking changes against your profile…" };
    const [changes, rejected] = validateChanges(edits, resume, master, jd);
    const gaps = usefulGaps(plan, master);
    record("check", { changes, rejected, gaps });

    // 5. score
    const tailored = applyChanges(resume, changes);
    const ats = { before: atsScore(resume, jd), after: atsScore(tailored, jd) };
    record("score", { tailored_resume: tailored, ats });

    yield {
      type: "result",
      thread_id: threadId,
      jd_hash: store.jdHash(jdText),
      jd_analysis: jd,
      summary: changes.find((c) => c.op === "rewrite_summary")?.after ?? resume.summary?.text ?? "",
      changes,
      rejected,
      skills: changes.find((c) => c.op === "update_skills")?.skills_after ?? resume.skills ?? [],
      gaps,
      ats,
      tailored_resume: tailored,
      review,
    };
  } catch (err) {
    if (signal?.aborted) return;
    record("error", { message: err instanceof Error ? err.message : String(err) });
    yield { type: "error", message: (err instanceof Error && err.message) || String(err) };
  } finally {
    await store.saveRunLog(workspace, runId, log).catch((err) => console.error("[redline] couldn't save run log:", err));
  }
}
