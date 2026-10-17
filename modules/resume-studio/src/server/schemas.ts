// What we ask the AI to return, as zod schemas. The AI SDK turns each into the
// provider's structured-output format (JSON schema or a tool definition) and hands
// back a validated object. Each `.describe(...)` is sent to the model too, so these
// descriptions double as instructions.
//
//   ResumeExtraction  ← parse an uploaded resume
//   JDAnalysis        ← understand a job description (ATS keywords + aliases)
//   TailorPlan        ← edits that tailor the resume to the JD
//   TailorReview      ← a recruiter's verdict on those edits (keep / improve / drop / add)
//   ChatDecision      ← what to do with a chat message (edit / answer / fact)

import { z } from "zod";
import type { ProposedEdit } from "./validation";

const text = () => z.string().default("");
const list = () => z.array(z.string()).default([]);

// ── 1. Resume extraction ──────────────────────────────────────────────────────

const Contact = z.object({
  name: text(),
  email: text(),
  phone: text(),
  location: text(),
  linkedin: text(),
  github: text(),
  website: text(),
});

const Job = z.object({
  company: z.string(),
  title: z.string(),
  location: text(),
  start_date: text(),
  end_date: text(),
  tools: list().describe("Every technology, tool or platform the job's bullets mention."),
  bullets: list().describe("Accomplishment lines, verbatim, without the bullet symbol."),
});

const Project = z.object({
  name: z.string(),
  tech: list().describe("The project's tech stack."),
  link: text(),
  start_date: text(),
  end_date: text(),
  bullets: list(),
});

const Education = z.object({
  institution: text(),
  degree: text(),
  field_of_study: text(),
  dates: text(),
  gpa: text(),
});

export const ResumeExtraction = z
  .object({
    contact: Contact.default(Contact.parse({})),
    summary: text(),
    experience: z.array(Job).default([]).describe("Every job, most recent first."),
    projects: z.array(Project).default([]).describe("Personal, academic or open-source projects."),
    skills: list().describe('One skill per entry: split "Python, Java" into two and drop labels like "Languages:".'),
    education: z.array(Education).default([]),
    certifications: list(),
  })
  .describe("A resume copied into structured fields, text exactly as written.");

// ── 2. Job description analysis ───────────────────────────────────────────────

const KeywordAlias = z.object({
  term: z.string(),
  aliases: list().describe('Other ways a resume may say the same thing, e.g. "Generative AI" → ["GenAI", "LLM"].'),
});

export const JDAnalysis = z
  .object({
    company: text(),
    role_title: text(),
    seniority: text().describe("e.g. intern, junior, mid, senior, lead"),
    domain: text().describe("e.g. backend, data, fintech"),
    must_have_skills: list().describe(
      "Hard requirements a recruiter would search for: skills, tools, languages, frameworks, platforms.",
    ),
    nice_to_have_skills: list().describe("Preferred / bonus skills of the same kind."),
    keywords: list().describe(
      "Other searchable domain concepts and methods (e.g. CI/CD, A/B testing) not in the skill lists.",
    ),
    keyword_aliases: z.array(KeywordAlias).default([]).describe("Aliases for every term above."),
    responsibilities: list().describe("Main duties, one short line each."),
  })
  .describe("A job description as an applicant-tracking system (ATS) sees it.");

// ── 3. Edits (shared by tailoring and chat) ───────────────────────────────────

const SummaryEdit = z.object({
  after: text().describe("The rewritten professional summary (≤ 70 words). Empty = no change."),
  reason: text(),
  keywords_added: list(),
});

const ProposedChange = z
  .object({
    op: z.enum(["rewrite_bullet", "add_bullet", "remove_bullet", "reorder_bullets"]),
    item_id: z.string().describe("Id of the job or project, e.g. 'exp1' or 'proj2'."),
    bullet_id: text().describe("Bullet to rewrite/remove (e.g. 'exp1_b2'), or to insert after for add_bullet."),
    before: text(),
    after: text().describe("New bullet text (≤ 30 words)."),
    new_order: list().describe("reorder_bullets only: the item's bullet ids in the new order."),
    reason: z.string().describe("One sentence tying the edit to the job."),
    keywords_added: list().describe("Job terms this edit introduces."),
  })
  .describe("One edit to a job's or project's bullets, referencing ids from the resume.");

const editFields = {
  summary: SummaryEdit.default(SummaryEdit.parse({})),
  changes: z.array(ProposedChange).default([]),
  skills: list().describe("Full new skills list, most relevant first. Empty = no change."),
};

const GapQuestion = z.object({
  skill: z.string(),
  question: z.string().describe('A short yes/no question, e.g. "The JD asks for Azure. Have you used it?"'),
  importance: z.enum(["must_have", "nice_to_have"]).default("nice_to_have"),
});

export const TailorPlan = z
  .object({
    ...editFields,
    gaps: z.array(GapQuestion).default([]).describe("Job requirements the profile shows no evidence for."),
  })
  .describe("The tailoring edits for one job description, plus questions about gaps.");

// ── 3b. Review ────────────────────────────────────────────────────────────────

const ReviewVerdict = z.object({
  change: z.string().describe("Id of the drafted edit, e.g. 'd3'."),
  action: z
    .enum(["keep", "improve", "drop"])
    .describe("keep = good as is · improve = better wording in `after` · drop = hurts or adds nothing"),
  after: text().describe("improve only: the better text (same limits: bullets ≤ 30 words, summary ≤ 70 words)."),
  reason: z.string().describe("One short sentence, from the recruiter's point of view."),
});

export const TailorReview = z
  .object({
    notes: list().describe(
      "1–3 short notes: what a recruiter sees in a 10-second scan of the tailored resume, and the biggest weakness left.",
    ),
    verdicts: z.array(ReviewVerdict).default([]).describe("One verdict per drafted edit."),
    additions: z
      .array(ProposedChange)
      .default([])
      .describe(
        "At most 3 extra edits, only for must-have requirements the master profile clearly backs but the resume still doesn't show.",
      ),
  })
  .describe("A hiring manager's review of the drafted edits.");

// ── 4. Chat ───────────────────────────────────────────────────────────────────

const ProfileFact = z.object({
  skill: text().describe("A tool or skill name, or empty."),
  item_id: text().describe("The job/project it belongs to, or empty if general."),
  note: z.string().describe("The fact in the candidate's own words, one sentence."),
});

export const ChatDecision = z
  .object({
    ...editFields,
    action: z
      .enum(["edit", "answer", "profile_update", "tailor_request"])
      .describe(
        "edit = change the resume · answer = reply only · profile_update = record a stated fact · " +
          "tailor_request = the message is itself a full job description",
      ),
    reply: z.string().describe("One or two friendly sentences saying what you did or answering the question."),
    profile_facts: z
      .array(ProfileFact)
      .default([])
      .describe("Only facts the candidate explicitly states in their message."),
  })
  .describe("How to respond to one chat message.");

export type ResumeExtraction = z.infer<typeof ResumeExtraction>;
export type JDAnalysis = z.infer<typeof JDAnalysis>;
export type TailorPlan = z.infer<typeof TailorPlan>;
export type ChatDecision = z.infer<typeof ChatDecision>;
export type TailorReview = z.infer<typeof TailorReview>;

/**
 * Flatten a proposal into the change list the review step and the browser use.
 * The summary and skills list become changes too, so every edit gets the same
 * accept / reject treatment.
 */
export function toChanges(proposal: Pick<TailorPlan, "summary" | "changes" | "skills">): ProposedEdit[] {
  const changes: ProposedEdit[] = proposal.changes.map((c) => ({ ...c }));
  if (proposal.summary.after.trim()) {
    changes.push({
      op: "rewrite_summary",
      after: proposal.summary.after,
      reason: proposal.summary.reason,
      keywords_added: proposal.summary.keywords_added,
    });
  }
  if (proposal.skills.length) {
    changes.push({
      op: "update_skills",
      skills_after: proposal.skills,
      reason: "Reordered and aligned skills with the job's requirements.",
    });
  }
  return changes;
}
