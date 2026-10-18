/**
 * Learn: tools and frameworks the jobs you approve ask for that aren't on your profile yet.
 * Each approved job adds its missing skills here, so before a first or second round you know
 * exactly what to study — and Offerloop can write study notes for each one.
 *
 * Pure types and helpers: runs on the server and in the browser, and under plain Node tests.
 */

export type LearnStatus = "new" | "learning" | "known";

export interface LearnJob {
  title: string;
  company: string;
  url: string;
  /** When it was approved. */
  at: string;
}

export interface LearnItem {
  /** Stable id: the skill's slug, also its study notes' storage key. */
  key: string;
  skill: string;
  status: LearnStatus;
  /** Jobs that asked for it, newest first. */
  jobs: LearnJob[];
  firstSeenAt: string;
  updatedAt: string;
  /** When study notes were last written (the notes themselves are stored separately). */
  notesAt?: string;
}

/** AI-written study notes for one tool, tuned to what the person already knows. */
export interface StudyNotes {
  skill: string;
  category: string;
  summary: string;
  whyCompaniesUseIt: string[];
  /** How it maps onto tools the person already knows. */
  connectsTo: string;
  keyConcepts: { name: string; explanation: string }[];
  /** A Mermaid flowchart of how the pieces fit together. */
  diagram: string;
  diagramCaption: string;
  quickStart: { language: string; code: string; explanation: string };
  interviewQuestions: { question: string; answerHint: string }[];
  studyPlan: { step: string; task: string }[];
  similarTo: string[];
  writtenAt: string;
}

const MAX_JOBS_PER_SKILL = 20;
const MAX_ITEMS = 200;

export const learnKey = (skill: string) =>
  skill
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80) || "skill";

/**
 * Add the missing skills of the jobs just approved. Returns the skills that weren't on the
 * list before. A skill already marked known stays known; it just gains the new job.
 */
export function addToLearn(
  list: LearnItem[],
  jobs: { title: string; company: string; url: string; missing?: string[] }[],
  now = new Date(),
): string[] {
  const at = now.toISOString();
  const added: string[] = [];
  for (const job of jobs) {
    for (const raw of job.missing ?? []) {
      const skill = raw.trim();
      if (!skill) continue;
      const key = learnKey(skill);
      let item = list.find((i) => i.key === key);
      if (!item) {
        item = { key, skill, status: "new", jobs: [], firstSeenAt: at, updatedAt: at };
        list.push(item);
        added.push(skill);
      }
      if (!item.jobs.some((j) => j.url === job.url)) {
        item.jobs.unshift({ title: job.title, company: job.company, url: job.url, at });
        item.jobs = item.jobs.slice(0, MAX_JOBS_PER_SKILL);
        item.updatedAt = at;
      }
    }
  }
  // Keep the list bounded: drop the oldest things already learned first.
  if (list.length > MAX_ITEMS) {
    list.sort((a, b) => Number(a.status === "known") - Number(b.status === "known") || b.updatedAt.localeCompare(a.updatedAt));
    list.length = MAX_ITEMS;
  }
  return added;
}

/** What to study first: still to learn, then most-asked, then most recent. */
export function sortForLearning(list: LearnItem[]): LearnItem[] {
  const rank: Record<LearnStatus, number> = { learning: 0, new: 1, known: 2 };
  return [...list].sort((a, b) => rank[a.status] - rank[b.status] || b.jobs.length - a.jobs.length || b.updatedAt.localeCompare(a.updatedAt));
}
