"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Check, ExternalLink, GraduationCap, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { MermaidDiagram } from "@/components/learn/MermaidDiagram";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import type { LearnItem, LearnStatus, StudyNotes } from "@/lib/learn";
import { addTool, loadNotes, removeTool, setToolStatus, useLearnList, writeNotes } from "@/lib/learn-client";
import { useProfile } from "@/lib/profile";
import { cn, plural } from "@/lib/utils";

const STATUS: Record<LearnStatus, { label: string; tone: "coral" | "info" | "success" }> = {
  new: { label: "To learn", tone: "coral" },
  learning: { label: "Learning", tone: "info" },
  known: { label: "Know it", tone: "success" },
};

export default function Learn() {
  const { items, error, refresh } = useLearnList();
  const [selected, setSelected] = useState<string | null>(null);
  const [showKnown, setShowKnown] = useState(false);
  const [newTool, setNewTool] = useState("");

  const visible = (items ?? []).filter((i) => showKnown || i.status !== "known");
  const knownCount = (items ?? []).filter((i) => i.status === "known").length;
  const current = (items ?? []).find((i) => i.key === selected) ?? visible[0] ?? null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (newTool.trim().length < 2) return;
    const { key } = await addTool(newTool.trim());
    setNewTool("");
    await refresh();
    setSelected(key);
  };

  return (
    <div>
      <PageHeader
        title="Learn"
        description="Tools and frameworks the jobs you approve ask for that aren't on your profile yet — so you know what to study before the first or second round. Each one can get study notes with a diagram, written around what you already know."
      />

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {items && items.length === 0 ? (
        <Card>
          <EmptyState icon={<GraduationCap className="size-5" />} title="Nothing to learn yet">
            When you approve jobs in a workflow, the tools they ask for that aren&apos;t on your profile show up here. In the Find step, set{" "}
            <b>New tools in the JD</b> to <b>Don&apos;t count — add to Learn</b> so those jobs aren&apos;t filtered out for it. You can also add a tool by hand below.
          </EmptyState>
          <AddForm value={newTool} onChange={setNewTool} onSubmit={add} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card className="self-start">
            <ul className="divide-y divide-line">
              {!items && (
                <li className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </li>
              )}
              {visible.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.key)}
                    className={cn("flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-ink/5", current?.key === item.key && "bg-coral-wash/60")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold [overflow-wrap:anywhere]">{item.skill}</span>
                      <span className="block text-xs text-muted">
                        {item.jobs.length ? `Asked by ${plural(item.jobs.length, "job")}` : "Added by you"}
                        {item.notesAt ? " · notes ready" : ""}
                      </span>
                    </span>
                    <Badge tone={STATUS[item.status].tone} className="shrink-0">
                      {STATUS[item.status].label}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
            {knownCount > 0 && (
              <button type="button" onClick={() => setShowKnown((v) => !v)} className="w-full border-t border-line px-4 py-2 text-left text-xs text-muted hover:text-text">
                {showKnown ? "Hide" : "Show"} {plural(knownCount, "tool")} you know
              </button>
            )}
            <AddForm value={newTool} onChange={setNewTool} onSubmit={add} />
          </Card>

          {current ? <ToolDetail key={current.key} item={current} onChanged={refresh} onRemoved={() => setSelected(null)} /> : null}
        </div>
      )}
    </div>
  );
}

function AddForm({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a tool, e.g. CrewAI"
        className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
        aria-label="Tool to learn"
      />
      <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs" disabled={value.trim().length < 2}>
        <Plus className="size-3.5" /> Add
      </Button>
    </form>
  );
}

function ToolDetail({ item, onChanged, onRemoved }: { item: LearnItem; onChanged: () => Promise<void>; onRemoved: () => void }) {
  const { profile } = useProfile();
  const [notes, setNotes] = useState<StudyNotes | null | undefined>(undefined);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNotes(item.key).then(
      (n) => !cancelled && setNotes(n),
      () => !cancelled && setNotes(null),
    );
    return () => {
      cancelled = true;
    };
  }, [item.key]);

  const write = async () => {
    setWriting(true);
    setError(null);
    try {
      setNotes(await writeNotes(item.key, profile?.skills ?? []));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't write the notes.");
    } finally {
      setWriting(false);
    }
  };
  const mark = async (status: LearnStatus) => {
    await setToolStatus(item.key, status);
    await onChanged();
  };
  const remove = async () => {
    if (!confirm(`Remove ${item.skill} from your Learn list?`)) return;
    await removeTool(item.key);
    onRemoved();
    await onChanged();
  };
  const docs = `https://www.google.com/search?q=${encodeURIComponent(`${item.skill} official documentation`)}`;

  return (
    <div className="min-w-0 space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{item.skill}</h2>
            {notes?.category && <p className="text-sm text-muted">{notes.category}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {item.status !== "learning" && (
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => mark("learning")}>
                <BookOpen className="size-3.5" /> Learning it
              </Button>
            )}
            {item.status !== "known" ? (
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => mark("known")}>
                <Check className="size-3.5" /> I know it
              </Button>
            ) : (
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => mark("new")}>
                Back to learn
              </Button>
            )}
            <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={remove} aria-label={`Remove ${item.skill}`}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {item.jobs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted">Asked for by</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {item.jobs.slice(0, 6).map((j) => (
                <li key={j.url}>
                  <a href={j.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {j.title}
                  </a>{" "}
                  <span className="text-muted">· {j.company}</span>
                </li>
              ))}
              {item.jobs.length > 6 && <li className="text-xs text-muted">+{item.jobs.length - 6} more</li>}
            </ul>
          </div>
        )}
        {item.status === "known" && (
          <p className="mt-4 text-xs text-muted">
            Know it now? Add it to your <Link href="/profile" className="font-semibold text-coral-strong hover:underline">Career Profile</Link> skills too, so jobs asking for it
            score higher.
          </p>
        )}
      </Card>

      {notes === undefined ? (
        <div className="h-40 animate-pulse rounded-lg bg-ink/5" />
      ) : notes === null ? (
        <Card className="p-5">
          <p className="font-semibold">Study notes</p>
          <p className="mt-1 text-sm text-muted">
            What it is, how it maps onto what you already know, a diagram of how it fits together, a quick-start example, likely interview questions and
            a short plan. Written by the AI you set up in Resume Studio.
          </p>
          {error && (
            <p className="mt-3 text-sm text-danger">
              {error}{" "}
              {/AI settings|API key|key/i.test(error) && (
                <Link href="/resume" className="font-semibold underline">
                  Open Resume Studio
                </Link>
              )}
            </p>
          )}
          <Button className="mt-4" onClick={write} disabled={writing}>
            {writing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {writing ? "Writing notes… (about 20 s)" : "Write study notes"}
          </Button>
        </Card>
      ) : (
        <NotesView notes={notes} docs={docs} writing={writing} error={error} onRewrite={write} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </Card>
  );
}

function NotesView({ notes, docs, writing, error, onRewrite }: { notes: StudyNotes; docs: string; writing: boolean; error: string | null; onRewrite: () => void }) {
  return (
    <>
      <Section title="What it is">
        <p className="text-sm">{notes.summary}</p>
        {notes.whyCompaniesUseIt.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {notes.whyCompaniesUseIt.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {notes.connectsTo && (
          <div className="mt-4 rounded-md border border-info/30 bg-info-wash/50 p-3 text-sm">
            <span className="font-semibold">From what you know: </span>
            {notes.connectsTo}
          </div>
        )}
      </Section>

      {notes.diagram && (
        <Section title="How it fits together">
          <MermaidDiagram source={notes.diagram} />
          {notes.diagramCaption && <p className="mt-3 text-center text-xs text-muted">{notes.diagramCaption}</p>}
        </Section>
      )}

      {notes.keyConcepts.length > 0 && (
        <Section title="Key concepts">
          <dl className="grid gap-3 sm:grid-cols-2">
            {notes.keyConcepts.map((c) => (
              <div key={c.name} className="rounded-md border border-line p-3">
                <dt className="text-sm font-semibold">{c.name}</dt>
                <dd className="mt-1 text-sm text-muted">{c.explanation}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {notes.quickStart.code && (
        <Section title="Quick start">
          <pre className="overflow-x-auto rounded-md bg-ink p-4 font-mono text-xs leading-relaxed text-paper">
            <code>{notes.quickStart.code}</code>
          </pre>
          {notes.quickStart.explanation && <p className="mt-3 text-sm text-muted">{notes.quickStart.explanation}</p>}
        </Section>
      )}

      {notes.interviewQuestions.length > 0 && (
        <Section title="Likely interview questions">
          <ul className="space-y-2">
            {notes.interviewQuestions.map((q) => (
              <li key={q.question}>
                <details className="group rounded-md border border-line px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold">{q.question}</summary>
                  <p className="mt-2 text-sm text-muted">{q.answerHint}</p>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {notes.studyPlan.length > 0 && (
        <Section title="Get interview-ready">
          <ol className="space-y-2">
            {notes.studyPlan.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-20 shrink-0 font-semibold text-coral-strong">{s.step}</span>
                <span>{s.task}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {notes.similarTo.length > 0 && <span>Similar to: {notes.similarTo.join(", ")}</span>}
        <a href={docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-coral-strong hover:underline">
          Find the official docs <ExternalLink className="size-3" />
        </a>
        <span className="ml-auto">Written {new Date(notes.writtenAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} by AI — check details against the docs.</span>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onRewrite} disabled={writing}>
          {writing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Rewrite
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </>
  );
}
