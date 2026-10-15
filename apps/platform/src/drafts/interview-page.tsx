"use client";

import { useState } from "react";
import { BookOpen, Mic } from "lucide-react";
import { Badge, Button, Card, CardHeader, ModuleBanner, PageHeader } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { COMPANIES, getCompany, PRACTICE_SESSIONS } from "@/lib/sample-data";
import { getTool } from "@/lib/tools";
import { cn, daysAgo } from "@/lib/utils";

const ROUNDS = [
  { id: "technical", label: "Technical", hint: "Concepts from your skills and the JD" },
  { id: "behavioral", label: "Behavioral", hint: "STAR stories: conflict, ownership, failure" },
  { id: "coding", label: "Coding", hint: "Talk through a LeetCode-style problem" },
  { id: "hr", label: "HR", hint: "Notice period, salary, why switch" },
];
const DURATIONS = [15, 30, 45];

const STORIES = [
  { title: "Cut dashboard load time by 35%", tags: ["Impact", "Performance"] },
  { title: "Shipped the AI interviewer solo in 6 weeks", tags: ["Ownership", "Learning fast"] },
];

export default function InterviewCoach() {
  const { profile } = useProfile();
  const tool = getTool("interview");
  const [company, setCompany] = useState(COMPANIES[0].slug);
  const [round, setRound] = useState("technical");
  const [minutes, setMinutes] = useState(30);


  return (
    <div>
      <PageHeader
        title="Interview Coach"
        description="A voice mock interview with Aria, built from the job and what this company actually asks. Scored at the end."
      />
      <ModuleBanner origin={tool.origin} status={tool.status}>
        Voice sessions connect next. Set up a session to see the flow.
      </ModuleBanner>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="New practice session" />
          <div className="space-y-6 p-5">
            <label className="block">
              <span className="text-sm font-semibold">Company</span>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
              >
                {COMPANIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-semibold">Round</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ROUNDS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRound(r.id)}
                    aria-pressed={round === r.id}
                    className={cn(
                      "rounded-md border px-4 py-3 text-left transition-colors",
                      round === r.id ? "border-ink bg-ink text-paper" : "border-line hover:border-faint",
                    )}
                  >
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className={cn("block text-xs", round === r.id ? "text-paper/60" : "text-muted")}>{r.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">Length</legend>
              <div className="mt-2 flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMinutes(d)}
                    aria-pressed={minutes === d}
                    className={cn(
                      "rounded-md border px-4 py-2 text-sm",
                      minutes === d ? "border-ink bg-ink text-paper" : "border-line hover:border-faint",
                    )}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {profile ? `Aria will ask about ${profile.skills.slice(0, 3).join(", ")} and ${getCompany(company)?.name}'s known interview topics.` : `Aria will ask about ${getCompany(company)?.name}'s known interview topics. Upload a resume to make it personal.`}
              </p>
              <Button disabled title="Voice sessions connect to the Aria engine in the next phase">
                <Mic className="size-4" /> Start interview
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Past sessions" />
            <ul className="divide-y divide-line">
              {PRACTICE_SESSIONS.map((s) => (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {getCompany(s.companySlug)?.name} · {s.round}
                    </p>
                    <Badge tone={s.score >= 8 ? "success" : "info"}>{s.score}/10</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{s.feedback}</p>
                  <p className="mt-1 text-[11px] text-faint">{daysAgo(s.daysAgo)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <BookOpen className="size-4" /> Story bank
                </span>
              }
              subtitle="Your reusable STAR stories, built from your sessions"
            />
            <ul className="divide-y divide-line">
              {STORIES.map((s) => (
                <li key={s.title} className="px-5 py-3">
                  <p className="text-sm">{s.title}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {s.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
