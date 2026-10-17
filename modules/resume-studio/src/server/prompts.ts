// The prompt each AI step sends: `instructions` (who the model is, the rules) and
// `messages` (the data for this request — resume, job, chat message…). The long
// system prompts live in system-prompts.ts.

import type { ModelMessage } from "ai";
import type { JdAnalysis, MasterProfile, Resume } from "../lib/tailor/types";
import { PROVIDERS, type Prompt, type ProviderId } from "./models";
import { CHAT_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT, TAILOR_SYSTEM_PROMPT } from "./system-prompts";

const asJson = (data: unknown) => JSON.stringify(data, null, 1);

/** Contact details aren't needed for tailoring, so don't send them. */
const withoutContact = <T extends { contact?: unknown }>(doc: T) => {
  const { contact: _contact, ...rest } = doc;
  return rest;
};

// ── 1. Resume extraction ──────────────────────────────────────────────────────

const RESUME_EXTRACTION_SYSTEM = `You copy resumes into structured data. Copy text exactly as written — never rephrase,
never invent. Leave a field empty rather than guessing. If the resume has several
columns, keep each column's content together instead of mixing lines across columns.`;

export interface ResumeDocument {
  mime: "application/pdf" | "text/plain";
  bytes: Uint8Array;
  text: string;
}

/**
 * The resume goes in as the PDF itself when the provider can read PDFs,
 * otherwise as column-aware extracted text (see extract.ts).
 */
export function resumeExtraction(provider: ProviderId, document: ResumeDocument): Prompt {
  const resume =
    document.mime === "application/pdf" && PROVIDERS[provider].readsPdf
      ? ({ type: "file", data: document.bytes, mediaType: "application/pdf", filename: "resume.pdf" } as const)
      : ({ type: "text", text: `Resume text:\n\n${document.text}` } as const);
  return {
    instructions: RESUME_EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: [resume, { type: "text", text: "Extract this resume." }] }],
  };
}

// ── 2. Job description analysis ───────────────────────────────────────────────

const JD_ANALYSIS_SYSTEM = `You analyse job descriptions the way an applicant-tracking system (ATS) does.
Keywords must be things a resume can literally contain: 1–3 words, in the job's own
spelling. Skip vague qualities and soft phrases ("production-ready", "team
collaboration", "fast-paced") — they are not ATS keywords. For every keyword, list
its aliases: abbreviations, expansions, common synonyms, spelling variants.`;

export function jdAnalysis(jdText: string): Prompt {
  return { instructions: JD_ANALYSIS_SYSTEM, messages: [{ role: "user", content: `Job description:\n\n${jdText}` }] };
}

// ── 3. Tailoring ──────────────────────────────────────────────────────────────

export function tailoring(jd: JdAnalysis, resume: Resume, master: MasterProfile): Prompt {
  return {
    instructions: TAILOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `## jd_analysis\n${asJson(jd)}` +
          `\n\n## current_resume\n${asJson(withoutContact(resume))}` +
          `\n\n## master_profile\n${asJson(withoutContact(master))}`,
      },
    ],
  };
}

// ── 3b. Review ────────────────────────────────────────────────────────────────

/** `drafted` = the drafted edits, each with the id the reviewer refers to (d1, d2…). */
export function review(jd: JdAnalysis, resume: Resume, master: MasterProfile, drafted: unknown[]): Prompt {
  return {
    instructions: REVIEW_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `## jd_analysis\n${asJson(jd)}` +
          `\n\n## current_resume\n${asJson(withoutContact(resume))}` +
          `\n\n## master_profile\n${asJson(withoutContact(master))}` +
          `\n\n## drafted_edits\n${asJson(drafted)}`,
      },
    ],
  };
}

// ── 4. Chat ───────────────────────────────────────────────────────────────────

/**
 * System prompt + the current resume/profile/job as context, then the
 * conversation so far (remembered per workspace — see chat.ts).
 */
export function chat(
  resume: Resume,
  master: MasterProfile,
  jd: JdAnalysis | null,
  conversation: ModelMessage[],
): Prompt {
  const context =
    "# Context for this conversation (always up to date)\n\n" +
    `## resume (as currently shown)\n${asJson(withoutContact(resume))}` +
    `\n\n## master_profile\n${asJson(withoutContact(master))}` +
    `\n\n## jd_analysis\n${jd ? asJson(jd) : "none — no job description yet"}`;
  return { instructions: `${CHAT_SYSTEM_PROMPT}\n\n${context}`, messages: conversation };
}
