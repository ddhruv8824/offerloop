"use client";

import { Ban, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui";
import type { FitArea, FitVerdict, JobFit, ScoredJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const VERDICT_TONE: Record<FitVerdict, "success" | "info" | "neutral" | "warning"> = {
  "Strong fit": "success",
  "Good fit": "info",
  "Worth a try": "neutral",
  "Long shot": "warning",
};

export function VerdictBadge({ verdict, className }: { verdict?: FitVerdict; className?: string }) {
  if (!verdict) return null;
  return (
    <Badge tone={VERDICT_TONE[verdict]} className={className}>
      {verdict}
    </Badge>
  );
}

const DOT: Record<FitArea["status"], string> = {
  good: "bg-success",
  ok: "bg-info",
  weak: "bg-warning",
  unknown: "bg-line",
};

/** The main reasons for and against, as two short lists. */
export function FitReasons({ strengths = [], gaps = [], className }: { strengths?: string[]; gaps?: string[]; className?: string }) {
  if (!strengths.length && !gaps.length) return null;
  return (
    <ul className={cn("space-y-0.5 text-xs", className)}>
      {strengths.map((s) => (
        <li key={s} className="flex gap-1.5 text-muted">
          <span className="text-success" aria-hidden>
            +
          </span>
          <span>{s}</span>
        </li>
      ))}
      {gaps.map((g) => (
        <li key={g} className="flex gap-1.5 text-muted">
          <span className="text-warning" aria-hidden>
            −
          </span>
          <span>{g}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Why 72%?": one line per area (skills, role, experience, location, pay), plus reasons. */
export function FitDetails({ fit, score }: { fit: JobFit; score: number }) {
  const w = fit.weights ?? { skills: 45, role: 25, experience: 15, location: 15 };
  return (
    <details className="group mt-3 text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-muted hover:text-text">
        Why {score}%? <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 rounded-md border border-line p-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          {fit.areas.map((area) => (
            <div key={area.key} className="contents">
              <dt className="flex items-center gap-1.5 font-semibold">
                <span className={cn("size-2 rounded-full", DOT[area.status])} aria-hidden />
                {area.label}
              </dt>
              <dd className="text-muted">
                {area.note}
                {area.score !== undefined && <span className="ml-1 font-mono text-faint">· {area.score}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <FitReasons strengths={fit.strengths} gaps={fit.gaps} className="mt-3 border-t border-line pt-2" />
        <p className="mt-2 text-faint">
          Score weights: skills {w.skills}, role {w.role}, experience {w.experience}, location {w.location}
          {w.role > w.skills ? " (role first: new tools don't count against it)" : ""}. Pay doesn&apos;t change the score; your minimum and
          deal-breakers rule jobs out instead.
        </p>
      </div>
    </details>
  );
}

/** Jobs your deal-breakers ruled out, listed on request so nothing disappears silently. */
export function HiddenJobs({ jobs, count }: { jobs: ScoredJob[]; count: number }) {
  if (!count) return null;
  return (
    <details className="group mt-4 rounded-md border border-line bg-paper text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-muted hover:text-text">
        <Ban className="size-4 shrink-0" aria-hidden />
        <span>
          {count} job{count === 1 ? "" : "s"} hidden by your deal-breakers
        </span>
        <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-semibold [overflow-wrap:anywhere] hover:underline">
              {job.title}
            </a>
            <span className="text-muted">· {job.company}</span>
            <span className="w-full text-xs text-warning">{job.vetoed}</span>
          </li>
        ))}
      </ul>
      {count > jobs.length && <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing the best {jobs.length}.</p>}
      <p className="border-t border-line px-4 py-2 text-xs text-muted">Change your deal-breakers or minimum pay on your profile.</p>
    </details>
  );
}
