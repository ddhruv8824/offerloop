// Server only. Collect from every source → score against the profile → merge duplicates.
import { dedupe, locationFit, roleRelevance, scoreJob, type FoundJob, type ScoredJob, type SearchProfile } from "@/lib/jobs";
import { withStatedSalary } from "./enrich";
import { mapLimit, SourceError } from "./http";
import { recordSalaries } from "./market";
import { ashby, greenhouse, lever, smartRecruiters } from "./providers/ats";
import { hiristSearch } from "./providers/hirist";
import { SOURCES, type CompanySource } from "./sources";

export interface SourceReport {
  name: string;
  via: string;
  ok: boolean;
  /** Open roles this source returned (before filtering to this person). */
  scanned: number;
  matched: number;
  error?: string;
}

export interface SearchResult {
  jobs: ScoredJob[];
  /** Jobs ruled out by the person's deal-breakers (best first, at most 20), each with `vetoed` set. */
  hidden: ScoredJob[];
  /** How many jobs the deal-breakers ruled out in all. */
  hiddenCount: number;
  sources: SourceReport[];
  scanned: number;
  matched: number;
  duplicatesMerged: number;
  fetchedAt: string;
}

const VIA: Record<CompanySource["provider"], string> = { ashby: "Ashby", smartrecruiters: "SmartRecruiters", greenhouse: "Greenhouse", lever: "Lever" };

export function fetchCompany(source: CompanySource, profile: SearchProfile): Promise<FoundJob[]> {
  switch (source.provider) {
    case "ashby":
      return ashby(source.id, source.name);
    case "greenhouse":
      return greenhouse(source.id, source.name);
    case "lever":
      return lever(source.id, source.name);
    case "smartrecruiters":
      // Full descriptions cost one request each, so read them only for the few roles whose
      // title is a strong fit for this person; the rest are scored on the title.
      return smartRecruiters(source.id, source.name, (job) => roleRelevance(job.title, profile.targetRole) >= 0.7 && locationFit(job, profile.locations) !== null);
  }
}

const reason = (err: unknown) => (err instanceof SourceError ? err.message : "failed");

export async function searchJobs(profile: SearchProfile, max = 80, { roleFirst = false } = {}): Promise<SearchResult> {
  const scored: ScoredJob[] = [];
  const scanned: FoundJob[] = [];
  const reports: SourceReport[] = [];

  const collect =(name: string, via: string, jobs: FoundJob[]) => {
    // One malformed posting must never sink the whole search: skip it and carry on.
    const fits = jobs
      .map((j) => {
        try {
          return scoreJob(withStatedSalary(j), profile, { roleFirst });
        } catch (err) {
          console.warn(`[jobs] skipped ${j.id}:`, err instanceof Error ? err.message : err);
          return null;
        }
      })
      .filter((j): j is ScoredJob => j !== null);
    scored.push(...fits);
    scanned.push(...jobs);
    reports.push({ name, via, ok: true, scanned: jobs.length, matched: fits.length });
  };

  await Promise.all([
    // Hirist is searched by keyword, so it's one request stream rather than one per company.
    hiristSearch(profile.targetRole, profile.locations).then(
      (jobs) => collect("Hirist", "Hirist", jobs),
      (err) => reports.push({ name: "Hirist", via: "Hirist", ok: false, scanned: 0, matched: 0, error: reason(err) }),
    ),
    mapLimit(SOURCES, 8, (source) =>
      fetchCompany(source, profile).then(
        (jobs) => collect(source.name, VIA[source.provider], jobs),
        (err) => reports.push({ name: source.name, via: VIA[source.provider], ok: false, scanned: 0, matched: 0, error: reason(err) }),
      ),
    ),
  ]);

  // Every posting that publishes its pay — whatever the role — feeds the salary market.
  // In the background: a search never waits for, or fails because of, bookkeeping.
  void recordSalaries(scanned).catch((err) => console.warn("[market] couldn't record salaries:", err instanceof Error ? err.message : err));

  const unique = dedupe(scored).sort((a, b) => b.score - a.score || (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const hidden = unique.filter((j) => j.vetoed);
  return {
    jobs: unique.filter((j) => !j.vetoed).slice(0, max),
    hidden: hidden.slice(0, 20),
    hiddenCount: hidden.length,
    sources: reports.sort((a, b) => Number(a.ok) - Number(b.ok) || b.matched - a.matched || a.name.localeCompare(b.name)),
    scanned: reports.reduce((n, r) => n + r.scanned, 0),
    matched: unique.length - hidden.length,
    duplicatesMerged: scored.length - unique.length,
    fetchedAt: new Date().toISOString(),
  };
}
