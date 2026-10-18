// Study notes for one tool or framework a job asks for and the candidate doesn't know yet:
// what it is, how it maps onto what they already know, a diagram, a quick start, likely
// interview questions and a short plan. Used by Offerloop's Learn page.

import { z } from "zod";
import { ask as askModel, type LlmConfig } from "./models";

const text = () => z.string().default("");
const list = () => z.array(z.string()).default([]);

export const StudyNotesSchema = z
  .object({
    category: text().describe('What kind of thing it is, 2–5 words, e.g. "Agent orchestration framework".'),
    summary: text().describe("What it is and what problem it solves, in 2–3 plain sentences."),
    why_companies_use_it: list().describe("2–4 short reasons teams pick it, as they'd say in a JD."),
    connects_to: text().describe(
      "2–3 sentences mapping it onto tools the candidate already knows (from known_skills): what's the same idea, what's new.",
    ),
    key_concepts: z
      .array(z.object({ name: z.string(), explanation: z.string().describe("1–2 sentences.") }))
      .default([])
      .describe("The 4–7 concepts you must understand to use it and talk about it in an interview."),
    diagram: text().describe(
      "A Mermaid diagram (flowchart TD or LR, or sequenceDiagram) of how its main pieces fit together in a typical app. " +
        "Mermaid source only — no ``` fences. Short node labels in double quotes; ≤ 12 nodes.",
    ),
    diagram_caption: text().describe("One sentence on what the diagram shows."),
    quick_start: z
      .object({
        language: text().describe('e.g. "python", "bash", "typescript"'),
        code: text().describe("A minimal, realistic example (≤ 30 lines) using the real API. No placeholders that can't run."),
        explanation: text().describe("2–3 sentences walking through it."),
      })
      .default({ language: "", code: "", explanation: "" }),
    interview_questions: z
      .array(z.object({ question: z.string(), answer_hint: z.string().describe("What a strong answer covers, 1–2 sentences.") }))
      .default([])
      .describe("5 questions an interviewer for these roles is likely to ask about it."),
    study_plan: z
      .array(z.object({ step: z.string().describe('e.g. "Day 1" or "Hour 1–2"'), task: z.string() }))
      .default([])
      .describe("3–5 steps to get interview-ready fast, building on what the candidate knows."),
    similar_to: list().describe("Alternatives or close relatives, ideally ones the candidate knows."),
  })
  .describe("Study notes that get a candidate interview-ready on one tool.");

export type StudyNotesOutput = z.output<typeof StudyNotesSchema>;

const SYSTEM = `You are a senior engineer coaching a job candidate who has applied to roles that ask
for a tool they haven't used yet. Write compact, accurate study notes so they can talk about
it confidently in a first or second interview round, and build something small with it.

Rules:
- Be accurate. If you're not sure an API detail is current, show the stable, well-known usage
  and keep it simple. Never invent package names, functions or features.
- Relate everything to what the candidate already knows (known_skills) — that's what makes
  the notes fast to learn from.
- Plain language, no hype. Short sentences.
- The diagram must be valid Mermaid: start with "flowchart TD", "flowchart LR" or
  "sequenceDiagram"; put node labels in double quotes; no fences, no styling, no HTML.`;

export interface StudyNotesInput {
  skill: string;
  /** What the candidate already knows (profile skills). */
  knownSkills: string[];
  /** Roles that asked for it, e.g. "AI Engineer at Tredence". */
  roles: string[];
}

export async function writeStudyNotes(
  cfg: LlmConfig,
  { skill, knownSkills, roles }: StudyNotesInput,
  { ask = askModel, signal }: { ask?: typeof askModel; signal?: AbortSignal } = {},
): Promise<StudyNotesOutput> {
  const notes = await ask(
    cfg,
    StudyNotesSchema,
    {
      instructions: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `## tool\n${skill}` +
            `\n\n## known_skills\n${knownSkills.slice(0, 40).join(", ") || "(none listed)"}` +
            `\n\n## roles asking for it\n${roles.slice(0, 8).join("\n") || "(not given)"}`,
        },
      ],
    },
    { temperature: 0.2, signal },
  );
  return { ...notes, diagram: cleanMermaid(notes.diagram) };
}

/** Models sometimes wrap Mermaid in ``` fences or add a "mermaid" line; strip that. */
export function cleanMermaid(source: string): string {
  return source
    .replace(/^\s*```(?:mermaid)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^\s*mermaid\s*\n/i, "")
    .trim();
}
