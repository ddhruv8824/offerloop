// Server only. The salary market: remember every posting that publishes its pay, and
// answer "what do roles like this pay?" from them.
import { locationFit, roleRelevance, type FoundJob, type SearchProfile } from "@/lib/jobs";
import { marketRange, type MarketRange, type SalaryObservation } from "@/lib/salary";
import { readMarket, updateMarket } from "../store";
import { withStatedSalary } from "./enrich";
import { hiristSalarySample } from "./providers/hirist";

/** The wide sample is 15 requests, so it runs at most twice a day per role. */
const SAMPLE_EVERY_MS = 12 * 60 * 60 * 1000;

const toObservation = (job: FoundJob, seenAt: string): SalaryObservation | null =>
  job.salaryLpa
    ? {
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        min: job.salaryLpa[0],
        max: job.salaryLpa[1],
        minExperience: job.minExperience,
        maxExperience: job.maxExperience,
        source: job.source,
        seenAt,
      }
    : null;

/** Keep the postings among `jobs` that publish pay. Newer sightings replace older ones. */
export async function recordSalaries(jobs: FoundJob[]): Promise<number> {
  const now = new Date().toISOString();
  const fresh = jobs.map((j) => toObservation(withStatedSalary(j), now)).filter((o): o is SalaryObservation => o !== null);
  if (!fresh.length) return 0;
  await updateMarket((data) => {
    const byId = new Map(data.salaryObservations.map((o) => [o.jobId, o]));
    for (const o of fresh) byId.set(o.jobId, o);
    data.salaryObservations = [...byId.values()];
  });
  return fresh.length;
}

// One sample per role at a time, even if several requests ask at once.
const g = globalThis as unknown as { __offerloopMarket?: Map<string, Promise<void>> };
const sampling = (g.__offerloopMarket ??= new Map());

/** Run the wide sample for this role if it hasn't run recently. Failures are logged, not thrown. */
async function refreshSample(role: string): Promise<void> {
  const key = role.trim().toLowerCase();
  const last = (await readMarket()).marketScans[key];
  if (last && Date.now() - Date.parse(last) < SAMPLE_EVERY_MS) return;
  let running = sampling.get(key);
  if (!running) {
    running = (async () => {
      try {
        const jobs = await hiristSalarySample(role);
        const kept = await recordSalaries(jobs);
        await updateMarket((data) => void (data.marketScans[key] = new Date().toISOString()));
        console.log(`[market] sampled ${jobs.length} "${role}" postings; ${kept} publish pay`);
      } catch (err) {
        // No timestamp is written, so the next request tries again.
        console.warn(`[market] sample for "${role}" failed:`, err instanceof Error ? err.message : err);
      } finally {
        sampling.delete(key);
      }
    })();
    sampling.set(key, running);
  }
  await running;
}

export interface SalaryMarket {
  range: MarketRange | null;
  /** Postings with published pay that we know of for any role (so the UI can explain a null range). */
  totalObservations: number;
}

/** What roles like this person's target pay, from everything collected so far. */
export async function salaryMarket(profile: SearchProfile): Promise<SalaryMarket> {
  await refreshSample(profile.targetRole);
  const { salaryObservations } = await readMarket();
  const cities = profile.locations.filter((c) => !/remote/i.test(c));
  const range = marketRange(salaryObservations, profile, {
    sameRole: (title) => roleRelevance(title, profile.targetRole) >= 0.7,
    sameCity: (location) => locationFit({ location, remote: false }, cities) === "exact",
  });
  return { range, totalObservations: salaryObservations.length };
}
