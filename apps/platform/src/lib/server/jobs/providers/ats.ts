// Server only. Public job-board APIs of four hiring systems. Each takes a company's
// board id and returns every open role, normalised. No login, no scraping.
import type { FoundJob } from "@/lib/jobs";
import { cached, decodeEntities, getJson, htmlToText, mapLimit } from "../http";

const TTL = 30 * 60 * 1000;

/* ── Ashby ──────────────────────────────────────────── */

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
}

export function ashby(slug: string, company: string): Promise<FoundJob[]> {
  return cached(`ashby:${slug}`, TTL, async () => {
    const data = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
    return (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        id: `Ashby:${slug}:${j.id}`,
        source: "Ashby" as const,
        company,
        title: j.title,
        location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join(" / ") || "Not specified",
        remote: Boolean(j.isRemote),
        url: j.jobUrl,
        postedAt: j.publishedAt,
        skills: [],
        description: (j.descriptionPlain ?? "").slice(0, 8000),
      }));
  });
}

/* ── Greenhouse ─────────────────────────────────────── */

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  absolute_url: string;
  first_published?: string;
  updated_at?: string;
  content?: string;
}

export function greenhouse(slug: string, company: string): Promise<FoundJob[]> {
  return cached(`greenhouse:${slug}`, TTL, async () => {
    const data = await getJson<{ jobs?: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`, 20_000);
    return (data.jobs ?? []).map((j) => {
      const location = j.location?.name ?? "Not specified";
      return {
        id: `Greenhouse:${slug}:${j.id}`,
        source: "Greenhouse" as const,
        company,
        title: j.title,
        location,
        remote: /remote/i.test(location),
        url: j.absolute_url,
        postedAt: j.first_published ?? j.updated_at,
        skills: [],
        // Greenhouse returns HTML with its tags entity-escaped.
        description: htmlToText(decodeEntities(j.content ?? "")),
      };
    });
  });
}

/* ── Lever ──────────────────────────────────────────── */

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
}

export function lever(slug: string, company: string): Promise<FoundJob[]> {
  return cached(`lever:${slug}`, TTL, async () => {
    const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    return (Array.isArray(data) ? data : []).map((j) => {
      const location = [...new Set([j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean))].join(" / ") || "Not specified";
      const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n");
      return {
        id: `Lever:${slug}:${j.id}`,
        source: "Lever" as const,
        company,
        title: j.text,
        location,
        remote: j.workplaceType === "remote" || /remote/i.test(location),
        url: j.hostedUrl,
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
        skills: [],
        description: `${j.descriptionPlain ?? ""}\n${lists}\n${j.additionalPlain ?? ""}`.slice(0, 8000),
      };
    });
  });
}

/* ── SmartRecruiters ────────────────────────────────── */

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
}
interface SrDetail {
  jobAd?: { sections?: Record<string, { text?: string } | undefined> };
}

/** SmartRecruiters' fullLocation often has an empty region: "Bengaluru, , India" → "Bengaluru, India". */
export const tidyLocation = (location: string) => location.replace(/(,\s*)+,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "");

/**
 * The list has no descriptions, so details are fetched only for postings the caller
 * says are worth it (`wants`), a few per company, and cached per posting.
 */
export async function smartRecruiters(companyId: string, company: string, wants: (job: FoundJob) => boolean, maxDetails = 4): Promise<FoundJob[]> {
  const id = encodeURIComponent(companyId);
  const list = await cached(`sr:${companyId}`, TTL, async () => {
    const postings: SrPosting[] = [];
    for (let offset = 0; offset < 300; offset += 100) {
      const page = await getJson<{ content?: SrPosting[]; totalFound?: number }>(
        `https://api.smartrecruiters.com/v1/companies/${id}/postings?country=in&limit=100&offset=${offset}`,
        20_000,
      );
      postings.push(...(page.content ?? []));
      if (postings.length >= (page.totalFound ?? 0) || !(page.content ?? []).length) break;
    }
    return postings.map<FoundJob>((p) => ({
      id: `SmartRecruiters:${companyId}:${p.id}`,
      source: "SmartRecruiters",
      company,
      title: p.name,
      location: tidyLocation(p.location?.fullLocation ?? [p.location?.city, p.location?.region, "India"].filter(Boolean).join(", ")) || "India",
      remote: Boolean(p.location?.remote),
      inIndia: true, // the list is requested with country=in
      url: `https://jobs.smartrecruiters.com/${id}/${p.id}`,
      postedAt: p.releasedDate,
      skills: [],
    }));
  });

  const worth = list.filter(wants).slice(0, maxDetails);
  const details = await mapLimit(worth, 2, (job) =>
    // Only successes are cached: a lookup that failed is tried again next time.
    cached(`sr-detail:${job.id}`, 6 * TTL, async () => {
      const d = await getJson<SrDetail>(`https://api.smartrecruiters.com/v1/companies/${id}/postings/${job.id.split(":")[2]}`);
      const s = d.jobAd?.sections ?? {};
      return htmlToText(`${s.jobDescription?.text ?? ""}\n${s.qualifications?.text ?? ""}`);
    }).catch(() => ""), // this time, score on the title alone
  );
  const byId = new Map(worth.map((job, i) => [job.id, details[i]]));
  return list.map((job) => (byId.has(job.id) ? { ...job, description: byId.get(job.id) } : job));
}
