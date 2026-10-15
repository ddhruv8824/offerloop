"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp, Plus, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SampleProfileButton } from "@/components/SampleProfileButton";
import { Button, Card } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import type { CareerProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const CITIES = ["Bangalore", "Pune", "Hyderabad", "Mumbai", "Delhi NCR", "Chennai", "Remote"];
const ROLE_SKILLS: Record<string, string[]> = {
  frontend: ["React", "TypeScript", "Next.js", "Tailwind CSS", "JavaScript", "Redux", "Testing Library"],
  backend: ["Node.js", "Python", "FastAPI", "PostgreSQL", "Docker", "Redis", "AWS"],
  full: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "Next.js", "Python"],
  data: ["Python", "SQL", "Pandas", "Machine Learning", "LangChain", "Spark"],
};
const DEAL_BREAKERS = ["No night shifts", "No service bond", "No relocation", "No service companies", "No 6-day weeks", "Remote only"];

const STEPS = ["About you", "Your next role", "Your skills", "Deal-breakers"] as const;

function suggestionsFor(role: string) {
  const r = role.toLowerCase();
  if (r.includes("front") || r.includes("ui")) return ROLE_SKILLS.frontend;
  if (r.includes("back")) return ROLE_SKILLS.backend;
  if (r.includes("full")) return ROLE_SKILLS.full;
  if (r.includes("data") || r.includes("ml") || r.includes("ai")) return ROLE_SKILLS.data;
  return ROLE_SKILLS.full;
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
        on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-text hover:border-faint",
      )}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-ink";

export default function Onboarding() {
  const router = useRouter();
  const { profile: existing, update } = useProfile();
  const [step, setStep] = useState(0);
  const [skillDraft, setSkillDraft] = useState("");
  const [customBreaker, setCustomBreaker] = useState("");
  const [draft, setDraft] = useState<CareerProfile>({
    name: "",
    headline: "",
    targetRole: "",
    experienceYears: 1,
    locations: [],
    skills: [],
    dealBreakers: [],
    createdAt: "",
  });

  // Editing an existing profile starts from it.
  useEffect(() => {
    if (existing) setDraft(existing);
  }, [existing]);

  const set = <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleIn = (key: "locations" | "skills" | "dealBreakers", value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));

  const addSkill = () => {
    const s = skillDraft.trim();
    if (s && !draft.skills.some((x) => x.toLowerCase() === s.toLowerCase())) set("skills", [...draft.skills, s]);
    setSkillDraft("");
  };

  const canContinue = [
    draft.name.trim().length > 0,
    draft.targetRole.trim().length > 0 && draft.locations.length > 0,
    draft.skills.length >= 3,
    true,
  ][step];

  const finish = () => {
    update({ ...draft, createdAt: draft.createdAt || new Date().toISOString() });
    router.push(existing ? "/profile" : "/dashboard?welcome=1");
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_400px]">
      <div className="px-4 py-6 sm:px-10 lg:py-10">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between">
            <Logo />
            {!existing && <SampleProfileButton variant="ghost" label="Skip — use a sample" />}
          </div>

          {/* Progress */}
          <ol className="mt-10 grid grid-cols-4 gap-2" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li key={label}>
                <div className={cn("h-1 rounded-full", i <= step ? "bg-coral" : "bg-line")} />
                <span className={cn("mt-2 hidden text-xs sm:block", i === step ? "font-semibold text-text" : "text-muted")}>{label}</span>
              </li>
            ))}
          </ol>

          <div key={step} className="mt-10 animate-fade-in">
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold">Let&apos;s set up your switch</h1>
                  <p className="mt-1 text-sm text-muted">You do this once. Every tool — jobs, resume, interviews — reads the same profile.</p>
                </div>
                <Field label="Your resume" hint="PDF or DOCX. We'll read it to pre-fill your skills and experience.">
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-faint bg-paper px-4 py-4 hover:border-ink">
                    <FileUp className="size-5 text-muted" aria-hidden />
                    <span className="text-sm">
                      {draft.resumeFileName ? (
                        <span className="font-semibold">{draft.resumeFileName}</span>
                      ) : (
                        <>
                          <span className="font-semibold">Choose a file</span> <span className="text-muted">or drop it here</span>
                        </>
                      )}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      className="sr-only"
                      onChange={(e) => set("resumeFileName", e.target.files?.[0]?.name)}
                    />
                  </label>
                  <p className="mt-2 text-xs text-muted">Resume reading connects to the Redline parser in the next phase — for now, fill the steps by hand.</p>
                </Field>
                <Field label="What should we call you?">
                  <input className={inputClass} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Your first name" autoFocus />
                </Field>
                <Field label="Current role" hint="Optional — e.g. 'Frontend Developer · 2 yrs'">
                  <input className={inputClass} value={draft.headline} onChange={(e) => set("headline", e.target.value)} placeholder="What you do today" />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold">What&apos;s next for you?</h1>
                  <p className="mt-1 text-sm text-muted">This decides which jobs we search for and how we score them.</p>
                </div>
                <Field label="Target role">
                  <input className={inputClass} value={draft.targetRole} onChange={(e) => set("targetRole", e.target.value)} placeholder="e.g. Frontend Developer" />
                </Field>
                <Field label={`Years of experience: ${draft.experienceYears}`}>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    value={draft.experienceYears}
                    onChange={(e) => set("experienceYears", Number(e.target.value))}
                    className="w-full accent-[var(--color-coral)]"
                  />
                </Field>
                <div>
                  <p className="text-sm font-semibold">Where do you want to work?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CITIES.map((c) => (
                      <Toggle key={c} on={draft.locations.includes(c)} onClick={() => toggleIn("locations", c)}>
                        {c}
                      </Toggle>
                    ))}
                  </div>
                </div>
                <Field label="Minimum salary (LPA)" hint="Optional. Jobs below this get flagged, not hidden.">
                  <input
                    type="number"
                    min={0}
                    className={cn(inputClass, "max-w-40")}
                    value={draft.minSalaryLpa ?? ""}
                    onChange={(e) => set("minSalaryLpa", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 12"
                  />
                </Field>
                <Field label="Current CTC (LPA)" hint="Optional. Only used to suggest what to ask for; it's never shown to anyone or sent to a job site.">
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    className={cn(inputClass, "max-w-40")}
                    value={draft.currentCtcLpa ?? ""}
                    onChange={(e) => set("currentCtcLpa", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 9"
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold">What are you good at?</h1>
                  <p className="mt-1 text-sm text-muted">Add at least 3. We match these against every job and only claim skills you list here.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="Type a skill and press Enter"
                  />
                  <Button variant="secondary" onClick={addSkill} aria-label="Add skill">
                    <Plus className="size-4" />
                  </Button>
                </div>
                {draft.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {draft.skills.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-ink py-1 pr-1 pl-3 text-sm text-paper">
                        {s}
                        <button type="button" onClick={() => toggleIn("skills", s)} className="rounded p-0.5 hover:bg-paper/15" aria-label={`Remove ${s}`}>
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted">Common for {draft.targetRole || "your role"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestionsFor(draft.targetRole)
                      .filter((s) => !draft.skills.includes(s))
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleIn("skills", s)}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-faint px-3 py-1 text-sm text-muted hover:border-ink hover:text-text"
                        >
                          <Plus className="size-3.5" aria-hidden /> {s}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold">Anything you won&apos;t accept?</h1>
                  <p className="mt-1 text-sm text-muted">Jobs that hit a deal-breaker are flagged so you don&apos;t waste an application. You can skip this.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...DEAL_BREAKERS, ...draft.dealBreakers.filter((d) => !DEAL_BREAKERS.includes(d))].map((d) => (
                    <Toggle key={d} on={draft.dealBreakers.includes(d)} onClick={() => toggleIn("dealBreakers", d)}>
                      {d}
                    </Toggle>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={customBreaker}
                    onChange={(e) => setCustomBreaker(e.target.value)}
                    placeholder="Add your own, e.g. 'No crypto companies'"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customBreaker.trim()) {
                        e.preventDefault();
                        toggleIn("dealBreakers", customBreaker.trim());
                        setCustomBreaker("");
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={finish}>
                {existing ? "Save profile" : "Open my workspace"} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Live preview of the shared profile */}
      <aside className="hidden border-l border-line bg-paper px-8 py-10 lg:block">
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Your career profile</p>
        <p className="mt-1 text-xs text-muted">This is what every tool will know about you.</p>
        <Card className="mt-5 overflow-hidden">
          <div className="bg-ink px-5 py-4 text-paper">
            <p className="font-display text-lg font-semibold">{draft.name || "Your name"}</p>
            <p className="text-sm text-paper/60">{draft.headline || "Current role"}</p>
          </div>
          <dl className="divide-y divide-line text-sm">
            <PreviewRow label="Target">{draft.targetRole ? `${draft.targetRole} · ${draft.experienceYears} yrs` : "—"}</PreviewRow>
            <PreviewRow label="Where">{draft.locations.length ? draft.locations.join(", ") : "—"}</PreviewRow>
            <PreviewRow label="Min salary">{draft.minSalaryLpa ? `${draft.minSalaryLpa} LPA` : "—"}</PreviewRow>
            <PreviewRow label="Current CTC">{draft.currentCtcLpa ? `${draft.currentCtcLpa} LPA` : "—"}</PreviewRow>
            <PreviewRow label="Skills">{draft.skills.length ? draft.skills.join(", ") : "—"}</PreviewRow>
            <PreviewRow label="Won't accept">{draft.dealBreakers.length ? draft.dealBreakers.join(", ") : "—"}</PreviewRow>
            <PreviewRow label="Resume">{draft.resumeFileName ?? "—"}</PreviewRow>
          </dl>
        </Card>
        <ul className="mt-6 space-y-2 text-xs text-muted">
          <li>→ Jobs uses your role, cities and skills to rank matches</li>
          <li>→ Resume Studio only writes claims backed by this profile</li>
          <li>→ DSA Prep picks questions for the companies you target</li>
        </ul>
      </aside>
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-5 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
