/**
 * Salary & culture insights for a job: what the company is like to work at, and what the
 * posting pays when it says so. Pure — no server or browser dependencies.
 *
 * Culture data today comes from the company block Hirist attaches to its job listings
 * (sourced from AmbitionBox). It is shown with its source and a link back; get permission
 * before showing it in a public product.
 */

export interface CompanyInfo {
  /** Overall employee rating out of 5. */
  rating?: number;
  reviewsCount?: number;
  reviewsUrl?: string;
  /** Benefits employees reported, most-reported first. */
  benefits: { name: string; count: number }[];
  /** Ratings for specific roles at the company, when reviewers gave them. */
  roleRatings: { name: string; rating: number; count: number }[];
  employeesIndia?: string;
  companyType?: string;
  industry?: string;
  foundedYear?: string;
  headquarters?: string;
  source: string;
}

/** Pay range in LPA (lakhs per annum). `min` is 0 when the posting only says "up to". */
export type SalaryLpa = [min: number, max: number];

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** Only AmbitionBox's own review pages are linked; anything else in that field is dropped. */
function reviewsLink(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && (u.hostname === "www.ambitionbox.com" || u.hostname === "ambitionbox.com") ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Hirist's `companyData.ambitionBoxInfo` → CompanyInfo. Null when it holds nothing useful. */
export function companyInfoFromAmbitionBox(raw: unknown): CompanyInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const rating = num(a.aggregateRating);
  const benefits = (Array.isArray(a.benefits) ? a.benefits : [])
    .map((b) => ({ name: str((b as Record<string, unknown>)?.name), count: num((b as Record<string, unknown>)?.count) ?? 0 }))
    .filter((b): b is { name: string; count: number } => Boolean(b.name))
    .sort((x, y) => y.count - x.count)
    .slice(0, 8);
  const roleRatings = (Array.isArray(a.topJobProfilesEntities) ? a.topJobProfilesEntities : [])
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return { name: str(row.name), rating: num(row.rating), count: num(row.count) ?? 0 };
    })
    .filter((r): r is { name: string; rating: number; count: number } => Boolean(r.name) && r.rating !== undefined)
    .slice(0, 15);
  const info: CompanyInfo = {
    rating: rating !== undefined && rating <= 5 ? Math.round(rating * 10) / 10 : undefined,
    reviewsCount: num(a.reviewsCount),
    reviewsUrl: reviewsLink(a.url),
    benefits,
    roleRatings,
    employeesIndia: str(a.totalEmployeesIndia),
    companyType: str(a.companyType),
    industry: str(a.primaryIndustry),
    foundedYear: str(a.foundedYear),
    headquarters: str(a.hq),
    source: "AmbitionBox, via Hirist",
  };
  // A block with only a name and a logo tells the user nothing.
  const useful = info.rating !== undefined || info.benefits.length > 0 || info.employeesIndia || info.companyType;
  return useful ? info : null;
}

/** The rating reviewers gave the role closest to this job title, if any (needs 3+ reviews). */
export function roleRatingFor(info: CompanyInfo, title: string) {
  const words = new Set(title.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2));
  let best: { name: string; rating: number; count: number; overlap: number } | undefined;
  for (const r of info.roleRatings) {
    if (r.count < 3) continue;
    const roleWords = r.name.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2);
    const overlap = roleWords.filter((w) => words.has(w)).length;
    // Every word of the reviewed role must appear in the job title ("Data Analyst" ⊂ "Senior Data Analyst").
    if (overlap === roleWords.length && overlap > 0 && (!best || overlap > best.overlap)) best = { ...r, overlap };
  }
  return best ? { name: best.name, rating: best.rating, count: best.count } : undefined;
}

/** The compact salary-and-culture record shown beside a job (and stored with workflow runs). */
export interface JobInsights {
  rating?: number;
  reviewsCount?: number;
  reviewsUrl?: string;
  /** How reviewers in this job's own role rated the company. */
  roleRating?: { name: string; rating: number; count: number };
  /** Most-reported benefits, by name. */
  benefits: string[];
  employeesIndia?: string;
  companyType?: string;
  /** Pay in LPA; min is 0 for "up to X". */
  salaryLpa?: SalaryLpa;
  salarySource?: "posting" | "description";
  /** Where the culture data came from. */
  source?: string;
  /** What to ask for, in LPA, and the figure not to go below (see lib/salary.ts). */
  askLpa?: number;
  askFloorLpa?: number;
  /** What the ask rests on: this posting's own pay, similar roles, or only the person's numbers. */
  askBasis?: "posting" | "market" | "personal";
}

/** Build that record for one job. Undefined when there is neither culture data nor a stated salary. */
export function insightsFor(job: { title: string; companyInfo?: CompanyInfo; salaryLpa?: SalaryLpa; salarySource?: "posting" | "description" }): JobInsights | undefined {
  const c = job.companyInfo;
  if (!c && !job.salaryLpa) return undefined;
  return {
    rating: c?.rating,
    reviewsCount: c?.reviewsCount,
    reviewsUrl: c?.reviewsUrl,
    roleRating: c ? roleRatingFor(c, job.title) : undefined,
    benefits: (c?.benefits ?? []).slice(0, 3).map((b) => b.name),
    employeesIndia: c?.employeesIndia,
    companyType: c?.companyType,
    salaryLpa: job.salaryLpa,
    salarySource: job.salarySource,
    source: c?.source,
  };
}

/* ── Salary ───────────────────────────────────────────── */

const SANE = (n: number) => n >= 1 && n <= 300;
const NUMBER = String.raw`(\d{1,3}(?:\.\d{1,2})?)`;
const UNIT = String.raw`(?:lpa|l\.p\.a\.?|lakhs?(?: per annum| p\.?a\.?)?|lacs?(?: per annum| p\.?a\.?)?)`;
const RANGE = new RegExp(String.raw`${NUMBER}\s*(?:${UNIT})?\s*(?:-|–|—|to)\s*${NUMBER}\s*${UNIT}\b`, "i");
const UP_TO = new RegExp(String.raw`(?:up\s?to|upto|max(?:imum)?(?: of)?)\s*(?:₹|rs\.?|inr)?\s*${NUMBER}\s*${UNIT}\b`, "i");
const SINGLE = new RegExp(String.raw`(?:ctc|salary|compensation|package|pay)\b[^.\n]{0,25}?(?:₹|rs\.?|inr)?\s*${NUMBER}\s*${UNIT}\b`, "i");
// Annual rupees written out, in Indian grouping: "₹18,00,000 - ₹25,00,000 per annum".
const AMOUNT = String.raw`(\d{1,2},\d{2},\d{3}|\d{6,8})`;
const RUPEES = new RegExp(String.raw`(?:₹|rs\.?|inr)\s*${AMOUNT}(?:\s*(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*${AMOUNT})?\s*(?:per annum|p\.?a\.?|annually|\/\s*year|per year)`, "i");

const lakhs = (rupees: string) => Math.round(Number(rupees.replace(/,/g, "")) / 10_000) / 10;

/**
 * Pay stated in a posting's text, in LPA. Conservative on purpose: it needs an explicit
 * unit (LPA / lakhs / annual rupees), so "5-8 years" or "team of 20" never read as pay.
 */
export function parseSalaryLpa(text: string): SalaryLpa | undefined {
  // A range that's written but makes no sense ("25-18 LPA") means we can't trust the text:
  // stop, rather than let a looser rule below pick one of its numbers.
  const range = RANGE.exec(text);
  if (range) {
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    return SANE(lo) && SANE(hi) && hi >= lo ? [lo, hi] : undefined;
  }
  const rupees = RUPEES.exec(text);
  if (rupees) {
    const lo = lakhs(rupees[1]);
    const hi = rupees[2] ? lakhs(rupees[2]) : lo;
    return SANE(lo) && SANE(hi) && hi >= lo ? [lo, hi] : undefined;
  }
  const upTo = UP_TO.exec(text);
  if (upTo && SANE(Number(upTo[1]))) return [0, Number(upTo[1])];
  const single = SINGLE.exec(text);
  if (single && SANE(Number(single[1]))) return [Number(single[1]), Number(single[1])];
  return undefined;
}

export function formatSalary([min, max]: SalaryLpa): string {
  if (min === 0) return `up to ${max} LPA`;
  return min === max ? `${max} LPA` : `${min}–${max} LPA`;
}
