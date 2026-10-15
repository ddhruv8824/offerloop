// Review checks for proposed edits. Nothing here blocks an honest-looking edit:
// the candidate reviews every change, so rule findings are attached to the change
// as `warnings` (shown as flags on its card) and the change is still applied.
//
// Flagged (applied, with a warning):
//   • a number in new text that isn't in the master profile
//   • a hard skill (tool / language / platform) the master profile doesn't back
//   • bullets over 30 words, summaries over 90 words
//   • more than one added / removed bullet per item vs the original resume
//
// Skipped (can't be applied, returned in `rejected` with a `rejection_reason`):
//   • unknown operations, items or bullets; two edits to the same bullet
//   • edits aimed at company, title, dates, education, certifications or contact
//   • empty text, removing an item's only bullet

import { applyChange } from "../lib/tailor/patch";
import type { Bullet, JdAnalysis, MasterProfile, RejectedChange, Resume, TailorChange } from "../lib/tailor/types";
import { containsTerm, flatten, normalize, numbersIn, wordCount } from "./text";

export const MAX_BULLET_WORDS = 30;
export const MAX_SUMMARY_WORDS = 90;

/** Keys that must never appear on a change — they would edit protected facts. */
const PROTECTED_KEYS = [
  "company", "title", "start_date", "end_date", "dates", "location",
  "name", "project_name", "institution", "degree", "field_of_study", "gpa",
  "contact", "email", "phone", "education",
];
const PROTECTED_PREFIXES = ["edu", "contact", "cert"];
const BULLET_OPS = ["rewrite_bullet", "add_bullet", "remove_bullet", "reorder_bullets"];
const ALL_OPS = [...BULLET_OPS, "rewrite_summary", "update_skills"];

/** A change as the model proposes it, before review gives it an id and warnings. */
export type ProposedEdit = Partial<TailorChange> & { op: string; [key: string]: unknown };

class Rejected extends Error {}

const quoted = (terms: string[]) => terms.map((t) => `'${t}'`).join(", ");

function findItem(resume: Resume, itemId: string) {
  return resume.experience.find((e) => e.id === itemId) ?? resume.projects.find((p) => p.id === itemId);
}

function resumeItemBullets(resume: Resume, itemId: string): Bullet[] {
  return [...(findItem(resume, itemId)?.bullets ?? [])];
}

// ── master-profile evidence ───────────────────────────────────────────────────

/** Text that backs skills for one job / project. */
function itemEvidence(master: MasterProfile, itemId: string): string {
  const parts = [...(master.confirmed_skills ?? [])];
  const job = master.jobs?.find((j) => j.id === itemId);
  const project = job ? undefined : master.projects?.find((p) => p.id === itemId);
  if (job) parts.push(...(job.tools ?? []), ...(job.bullets ?? []), job.notes ?? "");
  if (project) parts.push(...(project.tech ?? []), ...(project.bullets ?? []), project.notes ?? "");
  return parts.join("\n");
}

/** Text that backs skills anywhere on the resume (summary, skills list). */
function globalEvidence(master: MasterProfile): string {
  const parts = [...(master.confirmed_skills ?? [])];
  for (const job of master.jobs ?? []) parts.push(...(job.tools ?? []), ...(job.bullets ?? []), job.notes ?? "");
  for (const p of master.projects ?? []) parts.push(...(p.tech ?? []), ...(p.bullets ?? []), p.notes ?? "");
  parts.push(...(master.certifications ?? []), master.summary ?? "", master.notes ?? "");
  return parts.join("\n");
}

function jdTerms(jd: Partial<JdAnalysis>, ...keys: Array<"must_have_skills" | "nice_to_have_skills">): string[] {
  return keys.flatMap((key) => (jd[key] ?? []).filter((t) => typeof t === "string" && t.trim()));
}

// ── individual checks ─────────────────────────────────────────────────────────

function checkNumbers(after: string, profileNumbers: Set<string>): string[] {
  const invented = [...numbersIn(after)].filter((n) => !profileNumbers.has(n)).sort();
  return invented.length
    ? [`uses the number${invented.length > 1 ? "s" : ""} ${invented.join(", ")}, which isn't in your master profile`]
    : [];
}

/**
 * Tools, languages, platforms, certifications — things a resume can falsely claim.
 *
 * Soft phrases ("client communication", "scalable", "problem solving") are
 * wording, not claims, so they're free to use. Heuristic: a term is hard if it
 * has a capital letter, digit or tech symbol (Python, AWS, Node.js, C++, EC2),
 * or if the JD lists it as a skill and it's a single word (e.g. "pandas").
 */
export function isHardSkill(term: string, fromJdSkillList = false): boolean {
  const t = term.trim();
  if (/[A-Z0-9+#./]/.test(t)) return true;
  return fromJdSkillList && t.split(/\s+/).length === 1;
}

/** Flag newly introduced hard skills that `evidence` doesn't back. */
function checkSkills(
  before: string, after: string, keywordsAdded: string[], evidence: string, jdSkills: string[], scope: string,
): string[] {
  const jdKeys = new Set(jdSkills.map(normalize));
  const candidates = new Set(
    keywordsAdded.map((k) => k?.trim()).filter((k) => k && isHardSkill(k, jdKeys.has(normalize(k)))),
  );
  // Catch JD skills slipped into the text without being declared.
  for (const t of jdSkills) {
    if (isHardSkill(t, true) && containsTerm(after, t) && !containsTerm(before, t)) candidates.add(t);
  }
  const unsupported = [...candidates]
    .filter((t) => containsTerm(after, t) && !containsTerm(before, t) && !containsTerm(evidence, t))
    .sort();
  return unsupported.length
    ? [`adds ${quoted(unsupported)}, which your master profile doesn't show for ${scope}`]
    : [];
}

function checkBulletText(after: string): string[] {
  if (!after.trim()) throw new Rejected("new bullet text is empty");
  const n = wordCount(after);
  return n > MAX_BULLET_WORDS ? [`bullet is ${n} words (aim for ≤ ${MAX_BULLET_WORDS})`] : [];
}

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

// ── main entry point ──────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** The uploaded resume the ±1 bullet-count rule is measured against; defaults to `resume`. */
  original?: Resume;
  idPrefix?: string;
  bulletPrefix?: string;
}

/**
 * Check proposed changes in order; returns [applied, skipped].
 *
 * `resume` is what the changes edit (the resume as currently displayed).
 * Follow-up batches pass a distinct `idPrefix` / `bulletPrefix` so their ids
 * never collide with earlier ones.
 */
export function validateChanges(
  changes: ProposedEdit[],
  resume: Resume,
  master: MasterProfile,
  jd: Partial<JdAnalysis>,
  { original, idPrefix = "c", bulletPrefix = "new" }: ValidateOptions = {},
): [TailorChange[], RejectedChange[]] {
  const accepted: TailorChange[] = [];
  const rejected: RejectedChange[] = [];

  const working: Resume = {
    ...resume,
    experience: (resume.experience ?? []).map((e) => ({ ...e, bullets: [...(e.bullets ?? [])] })),
    projects: (resume.projects ?? []).map((p) => ({ ...p, bullets: [...(p.bullets ?? [])] })),
    summary: { ...(resume.summary ?? { id: "summary", text: "" }) },
    skills: [...(resume.skills ?? [])],
  };
  const profileNumbers = new Set([...flatten(master)].flatMap((s) => [...numbersIn(s)]));
  const evidenceAll = globalEvidence(master);
  const jdSkills = jdTerms(jd, "must_have_skills", "nice_to_have_skills");

  // Bullets already added / removed relative to the original upload count
  // towards the one-add / one-remove allowance per item.
  const adds = new Map<string, number>();
  const removes = new Map<string, number>();
  for (const item of [...working.experience, ...working.projects]) {
    const origIds = new Set(resumeItemBullets(original ?? resume, item.id).map((b) => b.id));
    const curIds = new Set(item.bullets.map((b) => b.id));
    adds.set(item.id, [...curIds].filter((id) => !origIds.has(id)).length);
    removes.set(item.id, [...origIds].filter((id) => !curIds.has(id)).length);
  }
  const reordered = new Set<string>();
  const touched = new Set<string>();
  let newBulletSeq = 0;

  for (const proposed of changes) {
    let change: ProposedEdit = proposed;
    try {
      const op = change.op;
      if (!ALL_OPS.includes(op)) throw new Rejected(`unknown operation '${op}'`);

      for (const key of PROTECTED_KEYS) {
        if (!isEmpty(change[key])) throw new Rejected(`tries to modify a protected field (${key})`);
      }

      const itemId = change.item_id || "";
      if (PROTECTED_PREFIXES.some((p) => itemId.toLowerCase().startsWith(p))) {
        throw new Rejected("education, certifications and contact details can't be changed");
      }

      const warnings: string[] = [];
      const after = (change.after ?? "").trim();
      const keywords = (change.keywords_added ?? []).filter((k): k is string => typeof k === "string");

      if (op === "rewrite_summary") {
        const before = working.summary.text ?? "";
        if (!after || normalize(after) === normalize(before)) continue; // no-op, drop silently
        if (wordCount(after) > MAX_SUMMARY_WORDS) {
          warnings.push(`summary is ${wordCount(after)} words (aim for ≤ ${MAX_SUMMARY_WORDS})`);
        }
        warnings.push(...checkNumbers(after, profileNumbers));
        warnings.push(...checkSkills(before, after, keywords, evidenceAll, jdSkills, "your profile"));
        change = { ...change, item_id: "summary", before, after };
      } else if (op === "update_skills") {
        const beforeSkills = [...working.skills];
        const have = new Set(beforeSkills.map(normalize));
        const kept: string[] = [];
        const unbacked: string[] = [];
        const seen = new Set<string>();
        for (const raw of change.skills_after ?? []) {
          if (typeof raw !== "string" || !raw.trim()) continue;
          const skill = raw.trim();
          const key = normalize(skill);
          if (seen.has(key)) continue;
          seen.add(key);
          kept.push(skill);
          if (!have.has(key) && !containsTerm(evidenceAll, skill)) unbacked.push(skill);
        }
        if (unbacked.length) warnings.push(`adds ${quoted(unbacked)}, which your master profile doesn't show`);
        if (kept.map(normalize).join("\n") === beforeSkills.map(normalize).join("\n")) continue;
        change = {
          ...change,
          item_id: "skills",
          skills_before: beforeSkills,
          skills_after: kept,
          keywords_added: kept.filter((s) => !have.has(normalize(s))),
        };
      } else {
        const item = findItem(working, itemId);
        if (!item) throw new Rejected(`unknown item '${itemId}'`);
        const bullets = item.bullets;
        const byId = new Map(bullets.map((b) => [b.id, b]));
        let bulletId = change.bullet_id || "";
        const label = "title" in item ? item.title : item.name;
        const scope = `${label}${"company" in item && item.company ? ` at ${item.company}` : ""}`;
        const evidence = itemEvidence(master, itemId);

        if (op === "rewrite_bullet") {
          if (touched.has(bulletId)) throw new Rejected("bullet already changed by another edit");
          const target = byId.get(bulletId);
          if (!target) throw new Rejected(`unknown bullet '${bulletId}'`);
          if (normalize(after) === normalize(target.text)) continue; // no-op, drop silently
          warnings.push(...checkBulletText(after));
          warnings.push(...checkNumbers(after, profileNumbers));
          warnings.push(...checkSkills(target.text, after, keywords, evidence, jdSkills, scope));
          touched.add(bulletId);
          change = { ...change, before: target.text, after };
        } else if (op === "add_bullet") {
          if ((adds.get(itemId) ?? 0) >= 1) {
            warnings.push("adds more than one bullet to this item vs your original resume");
          }
          if (bulletId && !byId.has(bulletId)) bulletId = "";
          warnings.push(...checkBulletText(after));
          warnings.push(...checkNumbers(after, profileNumbers));
          warnings.push(...checkSkills("", after, keywords, evidence, jdSkills, scope));
          newBulletSeq += 1;
          adds.set(itemId, (adds.get(itemId) ?? 0) + 1);
          change = {
            ...change,
            bullet_id: bulletId || null,
            before: "",
            after,
            new_bullet_id: `${itemId}_${bulletPrefix}${newBulletSeq}`,
          };
        } else if (op === "remove_bullet") {
          const target = byId.get(bulletId);
          if (!target) throw new Rejected(`unknown bullet '${bulletId}'`);
          if (touched.has(bulletId)) throw new Rejected("bullet already changed by another edit");
          if ((removes.get(itemId) ?? 0) >= 1) {
            warnings.push("removes more than one bullet from this item vs your original resume");
          }
          if (bullets.length <= 1) throw new Rejected("can't remove an item's only bullet");
          removes.set(itemId, (removes.get(itemId) ?? 0) + 1);
          touched.add(bulletId);
          change = { ...change, before: target.text, after: "" };
        } else {
          // reorder_bullets
          if (reordered.has(itemId)) throw new Rejected("item already reordered");
          const originalIds = resumeItemBullets(resume, itemId).map((b) => b.id);
          const listed = (change.new_order ?? []).filter((b): b is string => typeof b === "string");
          if (new Set(listed).size !== listed.length || !listed.every((b) => originalIds.includes(b))) {
            throw new Rejected("new order lists unknown or duplicate bullets");
          }
          // Bullets the model left out keep their relative order at the end.
          const newOrder = [...listed, ...originalIds.filter((b) => !listed.includes(b))];
          if (newOrder.join("\n") === originalIds.join("\n")) continue;
          reordered.add(itemId);
          change = { ...change, new_order: newOrder, before: "", after: "" };
        }
      }

      const done = {
        ...change,
        id: `${idPrefix}${accepted.length + 1}`,
        keywords_added: change.keywords_added ?? [],
        warnings,
      } as TailorChange;
      applyChange(working, done);
      accepted.push(done);
    } catch (err) {
      if (!(err instanceof Rejected)) throw err;
      rejected.push({ ...(change as Partial<TailorChange>), rejection_reason: err.message });
    }
  }

  return [accepted, rejected];
}

/** True if the master profile already backs `skill` anywhere. */
export function supportedSkill(master: MasterProfile, skill: string): boolean {
  return containsTerm(globalEvidence(master), skill);
}
