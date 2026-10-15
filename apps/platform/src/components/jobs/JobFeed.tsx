"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, FileText, Link2, Loader2, Plus, RefreshCw, Search, SearchX, X } from "lucide-react";
import { ProfilePrompt } from "@/components/ProfilePrompt";
import { Badge, Button, ButtonLink, Card, CompanyAvatar, EmptyState, ScoreRing, SkillChip } from "@/components/ui";
import { importJobLink, useJobSearch, type JobSearchResult } from "@/lib/job-finder";
import { JobInsightsLine } from "@/components/JobInsightsLine";
import { SalaryGuide } from "@/components/SalaryGuide";
import { jobInsights } from "@/lib/job-insights";
import type { CareerProfile } from "@/lib/types";
import type { ScoredJob } from "@/lib/jobs";
import { useProfile } from "@/lib/profile";
import { addCard, useTracker } from "@/lib/tracker";
import { cn, daysAgo, plural } from "@/lib/utils";

const MIN_SCORES = [0, 50, 65, 80];
const SHOWN_SKILLS = 8;
const PAGE_SIZE = 25;

const ageInDays = (iso?: string) => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(days) && days >= 0 ? days : null;
};
const posted = (iso?: string) => {
  const days = ageInDays(iso);
  if (days === null) return null;
  return days > 365 ? "over a year ago" : daysAgo(days);
};

/**
 * Jobs for you: the main feed of the dashboard. Finding jobs isn't a tool of its own; it
 * feeds the others (Tailor → Resume Studio, Track → Tracker, workflows → Automations).
 */
export function JobFeed() {
  const { profile } = useProfile();
  const tracker = useTracker();
  const search = useJobSearch(profile);

  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [source, setSource] = useState("All sources");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [hideTracked, setHideTracked] = useState(false);
  // The feed shares the dashboard with progress and tools: show the best few, more on request.
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [query, minScore, source, remoteOnly, hideTracked]);

  const [link, setLink] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ScoredJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const trackedUrls = useMemo(() => new Set((tracker?.cards ?? []).map((c) => c.url).filter(Boolean)), [tracker]);
  const result = search.result;

  const jobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (result?.jobs ?? [])
      .filter((j) => j.score >= minScore)
      .filter((j) => source === "All sources" || (source === "Company career pages" ? j.source !== "Hirist" : j.source === source))
      .filter((j) => !remoteOnly || j.remote || /remote/i.test(j.location))
      .filter((j) => !hideTracked || !trackedUrls.has(j.url))
      .filter((j) => !q || `${j.title} ${j.company} ${j.location} ${j.skills.map((s) => s.name).join(" ")}`.toLowerCase().includes(q));
  }, [result, query, minScore, source, remoteOnly, hideTracked, trackedUrls]);

  if (!profile) {
    return (
      <section id="jobs" aria-labelledby="jobs-title">
        <FeedHeader description="Open roles from Hirist and company career pages, ranked by how well they fit you." />
        <ProfilePrompt title="Tell Offerloop what you're looking for">
          Jobs are searched and ranked from your target role, cities and skills. Takes about 2 minutes, and every tool can reuse it.
        </ProfilePrompt>
      </section>
    );
  }

  const checkLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim() || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      setImported(await importJobLink(link.trim(), profile));
      setLink("");
    } catch (err) {
      setImported(null);
      setImportError(err instanceof Error ? err.message : "Couldn't read that link.");
    } finally {
      setImporting(false);
    }
  };

  const track = (job: ScoredJob) => addCard({ title: job.title, company: job.company, url: job.url, status: "saved", source: job.source, matchScore: job.score });
  const loading = search.status === "loading" || search.status === "idle";

  return (
    <section id="jobs" aria-labelledby="jobs-title">
      <FeedHeader
        description={`${profile.targetRole} roles${profile.locations.length ? ` in ${profile.locations.join(", ")}` : " anywhere in India"}, ranked against your ${plural(profile.skills.length, "skill")}.`}
        action={
          <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={search.refresh} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {/* Paste a link */}
      <Card className="mb-4 p-4">
        <form onSubmit={checkLink} className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Job link</span>
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Found a job elsewhere? Paste its link to see how well it fits"
              className="w-full rounded-md border border-line bg-paper py-2 pr-3 pl-9 text-sm outline-none focus:border-ink"
            />
          </label>
          <Button type="submit" variant="dark" disabled={!link.trim() || importing}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Check this job
          </Button>
        </form>
        {importError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {importError}
          </p>
        )}
        {imported && (
          <div className="mt-3 rounded-md border border-coral/40 bg-coral-wash/40">
            <div className="flex items-center justify-between px-4 pt-2 text-xs font-semibold text-coral-strong">
              From your link
              <button type="button" onClick={() => setImported(null)} className="rounded p-1 hover:bg-ink/5" aria-label="Dismiss">
                <X className="size-3.5" />
              </button>
            </div>
            <ul>
              <JobRow job={imported} profile={profile} tracked={trackedUrls.has(imported.url)} onTrack={() => track(imported)} isNew={false} />
            </ul>
          </div>
        )}
      </Card>

      <SalaryGuide profile={profile} />

      <SourceSummary result={result} loading={loading} error={search.status === "error" ? search.error : undefined} onRetry={search.refresh} />

      {result && (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Filter results</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title, company, city or skill"
                className="w-full rounded-md border border-line bg-paper py-2 pr-3 pl-9 text-sm outline-none focus:border-ink"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="rounded-md border border-line bg-paper px-3 py-2 text-sm" aria-label="Minimum match score">
                {MIN_SCORES.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "Any match" : `${s}+ match`}
                  </option>
                ))}
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm" aria-label="Source">
                {["All sources", "Hirist", "Company career pages"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-[var(--color-coral)]" />
                Remote
              </label>
              <label className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={hideTracked} onChange={(e) => setHideTracked(e.target.checked)} className="accent-[var(--color-coral)]" />
                Hide tracked
              </label>
            </div>
          </div>

          <Card className={cn(loading && "opacity-60")}>
            {jobs.length === 0 ? (
              <EmptyState icon={<SearchX className="size-5" />} title={result.jobs.length ? "No jobs match these filters" : "No matching roles found right now"}>
                {result.jobs.length
                  ? "Try a lower match score or clear the filter."
                  : "Try adding more cities or skills to your profile, or paste a job link above."}
              </EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {jobs.slice(0, shown).map((job) => (
                    <JobRow key={job.id} job={job} profile={profile} tracked={trackedUrls.has(job.url)} onTrack={() => track(job)} isNew={search.newIds.has(job.id)} />
                  ))}
                </ul>
                {jobs.length > shown && (
                  <div className="border-t border-line p-3 text-center">
                    <Button variant="secondary" className="px-4 py-1.5 text-sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, jobs.length - shown)} more
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
          <p className="mt-3 text-xs text-muted">
            Showing {Math.min(shown, jobs.length)} of {jobs.length} best matches. Green skills are on your profile; dashed ones aren&apos;t. Apply on the company&apos;s page, or let an
            automation apply on Hirist after you approve.
          </p>
        </>
      )}
    </section>
  );
}

function FeedHeader({ description, action }: { description: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id="jobs-title" className="text-lg font-semibold">
          Jobs for you
        </h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** What was searched, how much came back, and which sources failed — so results are never a black box. */
function SourceSummary({ result, loading, error, onRetry }: { result?: JobSearchResult; loading: boolean; error?: string; onRetry: () => void }) {
  if (!result) {
    return loading ? (
      <Card className="mb-4 flex items-center gap-3 p-5 text-sm text-muted">
        <Loader2 className="size-5 shrink-0 animate-spin text-coral-strong" />
        <span>
          <span className="font-semibold text-text">Searching Hirist and company career pages…</span> The first search takes 10–20 seconds; after that it&apos;s instant for a while.
        </span>
      </Card>
    ) : (
      <Card className="mb-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <p role="alert" className="flex-1 text-sm text-danger">
          {error ?? "Job search failed."}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </Card>
    );
  }

  const failed = result.sources.filter((s) => !s.ok);
  const ok = result.sources.filter((s) => s.ok);
  const age = Math.floor((Date.now() - new Date(result.fetchedAt).getTime()) / 60_000);
  return (
    <details className="mb-4 rounded-lg border border-line bg-paper text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        {loading && <Loader2 className="size-4 animate-spin text-coral-strong" aria-label="Refreshing" />}
        <span>
          Scanned <span className="font-semibold">{result.scanned.toLocaleString()}</span> open roles from {plural(ok.length, "source")} ·{" "}
          <span className="font-semibold">{result.matched}</span> fit you
          {result.duplicatesMerged > 0 && ` · ${plural(result.duplicatesMerged, "duplicate")} merged`}
        </span>
        <span className="text-muted">· {age < 1 ? "just now" : `${age} min ago`}</span>
        {failed.length > 0 && <Badge tone="warning">{plural(failed.length, "source")} didn&apos;t respond</Badge>}
        {error && <Badge tone="danger">Refresh failed — showing the last results</Badge>}
        <span className="ml-auto text-xs font-semibold text-coral-strong">Sources</span>
      </summary>
      <div className="border-t border-line px-4 py-3">
        {failed.length > 0 && (
          <p className="mb-3 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            Not included this time: {failed.map((s) => `${s.name} (${s.error})`).join(", ")}. Refresh in a minute to try them again.
          </p>
        )}
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {ok.map((s) => (
            <li key={s.name} className="flex justify-between gap-2">
              <span className="truncate">
                {s.name} <span className="text-faint">· {s.via}</span>
              </span>
              <span className="shrink-0 font-mono text-muted">
                {s.matched}/{s.scanned}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Numbers are roles that fit you / open roles checked. Company pages are read through their public job feeds.</p>
      </div>
    </details>
  );
}

function JobRow({ job, profile, tracked, onTrack, isNew }: { job: ScoredJob; profile: CareerProfile; tracked: boolean; onTrack: () => void; isNew: boolean }) {
  const skills = [...job.matched.map((name) => ({ name, have: true })), ...job.missing.map((name) => ({ name, have: false }))];
  const when = posted(job.postedAt);
  // An ask is shown per job only when the job states its own pay; the guide above covers the rest.
  const insights = jobInsights(job, profile);
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 gap-4">
        <CompanyAvatar name={job.company} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Some titles are one long token ("EMT3_VM_Python_Gen_AI_Developer"): let them break anywhere. */}
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="min-w-0 font-semibold [overflow-wrap:anywhere] hover:text-coral-strong">
              {job.title}
            </a>
            {isNew && <Badge tone="coral">New</Badge>}
            {job.score < 50 && <Badge tone="warning">Weak fit — consider skipping</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {job.company} · {job.location}
            {job.remote && !/remote/i.test(job.location) ? " · Remote OK" : ""}
            {job.minExperience !== undefined ? ` · ${job.minExperience}${job.maxExperience ? `–${job.maxExperience}` : "+"} yrs` : ""}
            {when ? ` · ${when}` : ""} · via {job.source === "Link" ? "your link" : job.source}
            {job.alsoOn.length > 0 && `, also on ${job.alsoOn.join(", ")}`}
          </p>
          {skills.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skills.slice(0, SHOWN_SKILLS).map((s) => (
                <SkillChip key={s.name} skill={s.name} state={s.have ? "have" : "missing"} />
              ))}
              {skills.length > SHOWN_SKILLS && <span className="self-center text-xs text-muted">+{skills.length - SHOWN_SKILLS} more</span>}
            </div>
          ) : (
            !job.limitedInfo && <p className="mt-2 text-xs text-muted">The posting doesn&apos;t name specific skills.</p>
          )}
          {job.limitedInfo && <p className="mt-2 text-xs text-muted">Scored on the title only — open the posting for the full requirements.</p>}
          {insights && <JobInsightsLine insights={insights} className="mt-3" />}
          {job.flags.map((flag) => (
            <p key={flag} className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> {flag}
            </p>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        <ScoreRing score={job.score} />
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold hover:border-faint"
          >
            Open <ExternalLink className="size-3" aria-label="in a new tab" />
          </a>
          <ButtonLink href="/resume" variant="secondary" className="px-3 py-1.5 text-xs">
            <FileText className="size-3.5" /> Tailor
          </ButtonLink>
          {tracked ? (
            <ButtonLink href="/tracker" variant="secondary" className="px-3 py-1.5 text-xs">
              <Check className="size-3.5" /> Tracked
            </ButtonLink>
          ) : (
            <Button variant="dark" className="px-3 py-1.5 text-xs" onClick={onTrack}>
              <Plus className="size-3.5" /> Track
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
