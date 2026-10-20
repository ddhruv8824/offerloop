// Tailoring without the browser: an automation hands over a job description, the saved resume
// in the person's workspace is tailored to it (the same five steps as Resume Studio), and the
// result is saved as a version they can open, review and download in Resume Studio.

import { applyActiveChanges } from "../lib/tailor/patch";
import type { Resume, ResumeVersion, TailorEvent } from "../lib/tailor/types";
import type { LlmConfig, RunOptions } from "./models";
import * as store from "./store";
import { buildMasterProfile } from "./structure";
import { runTailor } from "./tailor";

/** The person hasn't added a resume to Resume Studio yet. */
export class NoResumeError extends Error {}

export interface JobToTailor {
  jdText: string;
  title: string;
  company: string;
  url?: string;
}

export interface AutoTailorResult {
  versionId: string;
  label: string;
  atsBefore: number;
  atsAfter: number;
  /** Edits kept after the recruiter review and the honesty checks. */
  changes: number;
  /** Edits dropped because the profile doesn't back them. */
  rejected: number;
}

type Result = Extract<TailorEvent, { type: "result" }>;

/** Tailor the workspace's saved resume to one job and save it as a version. */
export async function tailorForJob(
  llm: LlmConfig,
  workspace: string,
  job: JobToTailor,
  options: RunOptions = {},
): Promise<AutoTailorResult> {
  const ws = await store.loadWorkspace(workspace);
  const resume = ws.current_resume;
  if (!resume) throw new NoResumeError("Add your resume in Resume Studio first: the automation tailors the resume saved there.");
  const master = ws.master_profile ?? buildMasterProfile(resume);

  let result: Result | null = null;
  for await (const ev of runTailor(llm, { workspace, runId: store.newRunId(), jdText: job.jdText, resume, master }, options)) {
    if (ev.type === "error") throw new Error(ev.message);
    if (ev.type === "result") result = ev;
  }
  if (!result) throw new Error("Tailoring stopped before it finished.");

  // Same id as a version made by hand in Resume Studio, so the same job isn't saved twice.
  const id = result.jd_hash.slice(0, 16);
  const previous = await store.getVersion(workspace, id);
  const now = new Date().toISOString();
  const a = result.jd_analysis;
  const label = [a.company || job.company, a.role_title || job.title].filter(Boolean).join(" — ");
  const version: ResumeVersion = {
    id,
    label,
    company: a.company || job.company,
    role_title: a.role_title || job.title,
    created_at: previous?.created_at ?? now,
    updated_at: now,
    jd_text: job.jdText,
    jd_hash: result.jd_hash,
    jd_analysis: a,
    base_resume: resume,
    changes: result.changes,
    statuses: {},
    rejected: result.rejected,
    gaps: result.gaps,
    gap_answers: {},
    thread_id: result.thread_id,
    review: result.review,
    job_url: job.url,
    origin: "automation",
  };
  await store.saveVersion(workspace, version);
  return {
    versionId: id,
    label,
    atsBefore: result.ats.before.score,
    atsAfter: result.ats.after.score,
    changes: result.changes.length,
    rejected: result.rejected.length,
  };
}

/** A saved version and the resume it produces (every edit not rejected applied). */
export async function readTailoredVersion(workspace: string, versionId: string): Promise<{ version: ResumeVersion; resume: Resume } | null> {
  const version = await store.getVersion(workspace, versionId);
  if (!version?.base_resume) return null;
  return { version, resume: applyActiveChanges(version.base_resume, version.changes ?? [], version.statuses ?? {}) };
}
