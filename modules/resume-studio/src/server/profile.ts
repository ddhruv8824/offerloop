// Adding facts the candidate tells us ("I used Terraform at Acme for 12 services")
// to their master profile.

import type { MasterProfile, ProfileFact } from "../lib/tailor/types";
import { containsTerm, numbersIn } from "./text";

const has = (values: string[], term: string) => values.some((v) => v.trim().toLowerCase() === term.trim().toLowerCase());

/**
 * Keep only facts whose skill and numbers the user actually typed.
 *
 * The AI extracts the facts; this guard stops it from slipping an invented
 * claim (a skill or metric the user never mentioned) into the profile.
 */
export function factsUserStated(facts: ProfileFact[], message: string): ProfileFact[] {
  const typed = numbersIn(message);
  return facts.filter(
    (f) =>
      (!(f.skill ?? "").trim() || containsTerm(message, f.skill)) &&
      [...numbersIn(f.note ?? "")].every((n) => typed.has(n)),
  );
}

/** Returns [updated copy of the master profile, facts that were added]. */
export function applyProfileFacts(master: MasterProfile, facts: ProfileFact[]): [MasterProfile, ProfileFact[]] {
  const updated = structuredClone(master);
  const added: ProfileFact[] = [];
  for (const fact of facts) {
    const note = (fact.note ?? "").trim();
    const skill = (fact.skill ?? "").trim();
    const itemId = (fact.item_id ?? "").trim();
    if (!note) continue;
    const job = (updated.jobs ?? []).find((j) => j.id === itemId);
    const project = job ? undefined : (updated.projects ?? []).find((p) => p.id === itemId);
    updated.confirmed_skills ??= [];
    if (skill && !has(updated.confirmed_skills, skill)) updated.confirmed_skills.push(skill);
    const item = job ?? project;
    if (item) {
      const tools = job ? (job.tools ??= []) : (project!.tech ??= []);
      if (skill && !has(tools, skill)) tools.push(skill);
      item.notes = `${item.notes ?? ""}\n${note}`.trim();
    } else {
      updated.notes = `${updated.notes ?? ""}\n${note}`.trim();
    }
    added.push({ skill, item_id: item ? itemId : "", note });
  }
  return [updated, added];
}
