// Server only. Hirist job search (read-only, no login), following Job-apply-tool/src/hirist.
//
// This is the JSON API Hirist's own website uses, not a published public API. Reading
// search results needs no account; applying does and stays in Job-apply-tool. Requests are
// spaced out and cached. Fine for personal use — get Hirist's OK before a public launch.
import { companyInfoFromAmbitionBox } from "@/lib/company-info";
import type { FoundJob } from "@/lib/jobs";
import { cached, getJson, htmlToText } from "../http";
import { resolveLocationIds } from "../hirist-locations";

const API = "https://gladiator.hirist.tech";
const ORIGIN = "https://www.hirist.tech";
const PAGE_SIZE = 20; // the site's own page size
const MAX_PAGES = 3;
const GAP_MS = 400;
const TTL = 15 * 60 * 1000;

interface HiristRaw {
  id: number;
  title: string;
  min?: number;
  max?: number;
  jobDetailUrl?: string;
  tags?: { name?: string; isMandatory?: boolean }[];
  locations?: { name: string }[];
  location?: { name: string }[];
  createdByAlias?: string;
  createdTimeMs?: number;
  workFromHome?: number;
  confidential?: number;
  /** `ambitionBoxInfo` is the employee-review summary Hirist shows on its own job pages. */
  companyData?: { companyName?: string; ambitionBoxInfo?: unknown } | null;
  /** Pay in LPA; 0 or hidden (`hideSal`) for most postings. */
  minSal?: number;
  maxSal?: number;
  hideSal?: number;
  introText?: string;
  hasExpired?: boolean;
  permanentlyRemoved?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const slugify = (v: string) => v.toLowerCase().replace(/&/g, "-and-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function jobUrl(raw: HiristRaw) {
  if (raw.jobDetailUrl) {
    try {
      const u = new URL(raw.jobDetailUrl);
      u.search = "";
      return u.toString();
    } catch {
      // fall through
    }
  }
  return `${ORIGIN}/j/${slugify(raw.title)}-${raw.id}`;
}

function normalise(raw: HiristRaw): FoundJob | null {
  const title = raw.title?.trim();
  if (!raw.id || !title) return null;
  const company = raw.companyData?.companyName?.trim() || (raw.confidential ? "Confidential company" : "Company not disclosed");
  const cities = (raw.locations ?? raw.location ?? []).map((l) => l.name).filter(Boolean);
  const remote = Boolean(raw.workFromHome) || cities.some((c) => /remote|work from home/i.test(c));
  // Hirist titles read "Company - Role - Stack"; drop the leading company for display.
  const parts = title.split(/\s+-\s+/);
  const shown = parts.length > 1 && parts[0].toLowerCase() === company.toLowerCase() ? parts.slice(1).join(" - ") : title;
  return {
    id: `Hirist:${raw.id}`,
    source: "Hirist",
    company,
    title: shown,
    location: cities.join(" / ") || raw.createdByAlias?.trim() || "Not specified",
    remote,
    url: jobUrl(raw),
    postedAt: raw.createdTimeMs ? new Date(raw.createdTimeMs).toISOString() : undefined,
    // Some tags arrive without a name; skip those.
    skills: (raw.tags ?? []).flatMap((t) => (typeof t?.name === "string" && t.name.trim() ? [{ name: t.name.trim(), required: Boolean(t.isMandatory) }] : [])),
    inIndia: true,
    minExperience: raw.min,
    maxExperience: raw.max,
    ...postedSalary(raw),
    companyInfo: companyInfoFromAmbitionBox(raw.companyData?.ambitionBoxInfo) ?? undefined,
    description: raw.introText ? htmlToText(raw.introText) : undefined,
  };
}

/** The posting's own salary field, when the company chose to show it. */
function postedSalary(raw: HiristRaw): Pick<FoundJob, "salaryLpa" | "salarySource"> {
  const [min, max] = [Number(raw.minSal) || 0, Number(raw.maxSal) || 0];
  if (raw.hideSal === 1 || max <= 0 || max > 300 || min > max) return {};
  return { salaryLpa: [min, max], salarySource: "posting" };
}

/** City names → Hirist location ids, ignoring anything Hirist doesn't know (and "Remote"). */
function locationIds(cities: string[]) {
  const ids = new Set<number>();
  for (const city of cities) {
    const name = /delhi ncr/i.test(city) ? "Delhi, Gurgaon, Noida" : city;
    for (const part of name.split(",")) {
      try {
        resolveLocationIds(part.trim()).forEach((id) => ids.add(id));
      } catch {
        // not a Hirist location — search without it
      }
    }
  }
  return [...ids];
}

/** Read up to `maxPages` pages of a Hirist search, one request at a time with a polite gap. */
async function searchPages(keyword: string, loc: number[], maxPages: number): Promise<FoundJob[]> {
  const jobs: FoundJob[] = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(GAP_MS);
    const params = new URLSearchParams({ query: keyword, page: String(page), posting: "0", industry: "", size: String(PAGE_SIZE) });
    if (loc.length) params.set("loc", loc.join(","));
    const body = await getJson<{ data?: HiristRaw[]; hasMore?: boolean }>(`${API}/job/search?${params}`, 20_000);
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const raw of rows) {
      const job = normalise(raw);
      if (job) jobs.push(job);
    }
    if (!body.hasMore || rows.length === 0) break;
  }
  return jobs;
}

export function hiristSearch(keyword: string, cities: string[]): Promise<FoundJob[]> {
  const loc = locationIds(cities.filter((c) => !/remote/i.test(c)));
  // "v2": results now carry company info and salary; don't serve older cached ones without them.
  return cached(`hirist:v2:${keyword.toLowerCase()}:${loc.join(",")}`, TTL, () => searchPages(keyword, loc, MAX_PAGES));
}

/**
 * A wide, India-wide sample for one role, used only to learn what such roles pay: about 6%
 * of postings publish their salary, so it takes a few hundred to see a range. The caller
 * decides how often to run it (see market.ts — twice a day at most).
 */
export function hiristSalarySample(keyword: string, pages = 15): Promise<FoundJob[]> {
  return searchPages(keyword, [], pages);
}

/** One Hirist job by id (for "paste a link"). Null when it's gone. */
export async function hiristJob(jobId: string): Promise<FoundJob | null> {
  const body = await getJson<{ data?: HiristRaw }>(`${API}/job/detail?jobcode=${encodeURIComponent(jobId)}`, 20_000);
  const raw = body.data;
  if (!raw || raw.hasExpired || raw.permanentlyRemoved) return null;
  return normalise(raw);
}
