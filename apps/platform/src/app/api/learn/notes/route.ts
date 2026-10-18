import { NextResponse, type NextRequest } from "next/server";
import { LlmConfigError, resolveConfig, writeStudyNotes } from "@offerloop/resume-studio/server";
import type { StudyNotes } from "@/lib/learn";
import { readStore, readStudyNotes, saveStudyNotes, updateStore } from "@/lib/server/store";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
// Writing notes is one model call; give slow providers room.
export const maxDuration = 120;

/** Saved study notes for one tool: ?key=… (null when none yet). */
export const GET = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  try {
    return NextResponse.json({ notes: await readStudyNotes<StudyNotes>(user.id, key) });
  } catch {
    return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  }
});

/**
 * Write (or rewrite) study notes for one tool on the Learn list: { key, knownSkills? }.
 * Uses the AI provider and key from Resume Studio's AI settings (X-LLM-* headers), or a
 * server key when one is set.
 */
export const POST = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; knownSkills?: unknown };
  const data = await readStore(user.id);
  const item = data.learning.find((i) => i.key === body.key);
  if (!item) return NextResponse.json({ error: "That tool isn't on your Learn list." }, { status: 404 });

  let cfg;
  try {
    cfg = resolveConfig(req.headers.get("x-llm-provider"), req.headers.get("x-llm-model"), req.headers.get("x-llm-key"));
  } catch (err) {
    const message = err instanceof LlmConfigError ? `${err.message} (Resume Studio → AI settings)` : "AI settings are missing.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const fromBrowser = Array.isArray(body.knownSkills) ? body.knownSkills.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 40)) : [];
  const knownSkills = fromBrowser.length ? fromBrowser.slice(0, 60) : (data.profile?.skills ?? []);
  try {
    const written = await writeStudyNotes(cfg, {
      skill: item.skill,
      knownSkills,
      roles: item.jobs.map((j) => `${j.title} at ${j.company}`),
    });
    const notes: StudyNotes = {
      skill: item.skill,
      category: written.category,
      summary: written.summary,
      whyCompaniesUseIt: written.why_companies_use_it,
      connectsTo: written.connects_to,
      keyConcepts: written.key_concepts,
      diagram: written.diagram,
      diagramCaption: written.diagram_caption,
      quickStart: written.quick_start,
      interviewQuestions: written.interview_questions.map((q) => ({ question: q.question, answerHint: q.answer_hint })),
      studyPlan: written.study_plan,
      similarTo: written.similar_to,
      writtenAt: new Date().toISOString(),
    };
    await saveStudyNotes(user.id, item.key, notes);
    await updateStore(user.id, (d) => {
      const it = d.learning.find((i) => i.key === item.key);
      if (it) {
        it.notesAt = notes.writtenAt;
        if (it.status === "new") it.status = "learning";
      }
    });
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't write the notes. Try again." }, { status: 502 });
  }
});
