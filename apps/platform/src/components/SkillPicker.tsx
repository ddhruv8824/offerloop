"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FileUp, Loader2, Plus, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { ResumeFacts } from "@/lib/resume-facts";
import { normalizeSkill, searchSkills, suggestedSkills } from "@/lib/skills";
import { cn } from "@/lib/utils";
import { withBase } from "@/lib/base-path";

const inputClass =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-ink";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Add skills to a list, skipping ones already there (any casing). */
export function mergeSkills(current: string[], more: string[]): string[] {
  const out = [...current];
  for (const s of more) if (s.trim() && !out.some((x) => same(x, s))) out.push(s.trim());
  return out;
}

/** Upload a resume: the skills it mentions and basic facts (see /api/profile/resume-skills). */
export async function readResume(file: File): Promise<{ skills: string[]; facts: ResumeFacts }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(withBase("/api/profile/resume-skills"), { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { skills?: string[]; facts?: ResumeFacts; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn't read that resume.");
  return { skills: body.skills ?? [], facts: body.facts ?? {} };
}

interface Props {
  skills: string[];
  onChange: (skills: string[]) => void;
  targetRole: string;
  /** Skills that came from the resume, to mention where they came from. */
  fromResume?: { fileName: string; count: number } | null;
  /** A resume was read here: report its name and what was found. */
  onResumeRead?: (fileName: string, found: string[]) => void;
}

/**
 * Pick skills: type with autocomplete (spelling fixed to the catalogue's), add suggestions
 * for the target role, or read them from a resume.
 */
export function SkillPicker({ skills, onChange, targetRole, fromResume, onResumeRead }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const listId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => searchSkills(text, skills), [text, skills]);
  const suggestions = useMemo(() => suggestedSkills(targetRole, skills, showAll ? 60 : 16), [targetRole, skills, showAll]);
  // Saved skills whose spelling the catalogue would fix ("Langraph" → "LangGraph").
  const fixes = skills
    .map((s) => ({ from: s, to: normalizeSkill(s) }))
    .filter(({ from, to }) => to !== from && !skills.some((x) => x !== from && same(x, to)));

  const typed = text.trim();
  // Already in the list under its catalogue spelling ("pytroch" when PyTorch is picked).
  const duplicate = typed ? skills.find((s) => same(s, normalizeSkill(typed))) : undefined;
  const highlighted = open && matches.length ? matches[Math.min(active, matches.length - 1)] : null;
  // What Enter adds: the highlighted suggestion, else the typed text with its spelling fixed.
  const toAdd = highlighted?.name ?? normalizeSkill(typed);

  const add = (skill: string) => {
    if (!skill.trim()) return;
    onChange(mergeSkills(skills, [skill]));
    setText("");
    setActive(0);
  };
  const remove = (skill: string) => onChange(skills.filter((s) => s !== skill));
  const fix = (from: string, to: string) => onChange(skills.map((s) => (s === from ? to : s)));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(toAdd);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !text && skills.length) {
      remove(skills[skills.length - 1]);
    }
  };

  const readFromResume = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError("");
    try {
      const { skills: found } = await readResume(file);
      onChange(mergeSkills(skills, found));
      onResumeRead?.(file.name, found);
      if (!found.length) setReadError("We didn't find any skills we know in that resume. Add them by hand below.");
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Couldn't read that resume.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      {/* From the resume */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper px-4 py-3">
        <Sparkles className="size-4 shrink-0 text-coral" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          {fromResume ? (
            <>
              Found <span className="font-semibold">{fromResume.count} skill{fromResume.count === 1 ? "" : "s"}</span> in{" "}
              <span className="font-semibold">{fromResume.fileName}</span>{" "}and added them. Remove any that aren&apos;t right.
            </>
          ) : (
            <span className="text-muted">Already listed them in your resume? We can read them from it.</span>
          )}
        </p>
        <Button type="button" variant="secondary" className="py-1.5" disabled={reading} onClick={() => fileInput.current?.click()}>
          {reading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
          {reading ? "Reading…" : fromResume ? "Read another" : "Read from resume"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx"
          className="sr-only"
          aria-label="Resume file to read skills from"
          onChange={(e) => readFromResume(e.target.files?.[0])}
        />
        {readError && <p className="w-full text-sm text-danger">{readError}</p>}
      </div>

      {/* Type to add, with autocomplete */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Type a skill — e.g. LangGraph, React, SQL"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlighted ? `${listId}-${active}` : undefined}
          />
          <Button variant="secondary" onClick={() => add(toAdd)} aria-label="Add skill" disabled={!typed}>
            <Plus className="size-4" />
          </Button>
        </div>

        {open && typed && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line bg-paper shadow-lg">
            {matches.length > 0 && (
              <ul id={listId} role="listbox" aria-label="Matching skills" className="max-h-64 overflow-auto py-1">
                {matches.map((m, i) => (
                  <li
                    key={m.name}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                    onClick={() => add(m.name)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between px-3 py-2 text-sm",
                      i === active ? "bg-ink/5 text-text" : "text-text",
                    )}
                  >
                    <span>{m.name}</span>
                    {m.kind === "typo" && <span className="text-xs text-muted">did you mean?</span>}
                  </li>
                ))}
              </ul>
            )}
            {duplicate && !matches.length && (
              <p className="px-3 py-2 text-sm text-muted">
                <span className="font-semibold text-text">{duplicate}</span> is already in your skills.
              </p>
            )}
            {!duplicate && !matches.some((m) => same(m.name, typed)) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(typed)}
                className="w-full border-t border-line px-3 py-2 text-left text-sm text-muted hover:bg-ink/5 hover:text-text"
              >
                Add “{typed}” as written
              </button>
            )}
          </div>
        )}
      </div>

      {/* Picked */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md bg-ink py-1 pr-1 pl-3 text-sm text-paper">
              {s}
              <button type="button" onClick={() => remove(s)} className="rounded p-0.5 hover:bg-paper/15" aria-label={`Remove ${s}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Spelling fixes for skills already picked */}
      {fixes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Wand2 className="size-4 text-muted" aria-hidden />
          <span className="text-muted">Fix spelling:</span>
          {fixes.map(({ from, to }) => (
            <button
              key={from}
              type="button"
              onClick={() => fix(from, to)}
              className="rounded-md border border-dashed border-faint px-2.5 py-1 hover:border-ink"
            >
              <span className="text-muted line-through">{from}</span> → <span className="font-semibold">{to}</span>
            </button>
          ))}
        </div>
      )}

      {/* Suggestions for the target role */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">Common for {targetRole.trim() || "your role"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-faint px-3 py-1 text-sm text-muted hover:border-ink hover:text-text"
              >
                <Plus className="size-3.5" aria-hidden /> {s}
              </button>
            ))}
            {!showAll && suggestions.length >= 16 && (
              <button type="button" onClick={() => setShowAll(true)} className="px-2 py-1 text-sm font-semibold text-muted hover:text-text">
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
