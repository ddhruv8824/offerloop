import { insightsFor, type CompanyInfo, type JobInsights, type SalaryLpa } from "./company-info";
import { bandPosition, recommendAsk, type MarketRange } from "./salary";

interface JobLike {
  title: string;
  companyInfo?: CompanyInfo;
  salaryLpa?: SalaryLpa;
  salarySource?: "posting" | "description";
  minExperience?: number;
  maxExperience?: number;
}

interface Person {
  experienceYears: number;
  currentCtcLpa?: number;
  minSalaryLpa?: number;
}

/**
 * Salary and culture for one job, including what to ask for.
 *
 * A job that states its own pay gets an ask from that range and where the person sits in
 * the experience it wants. Otherwise — when `market` is passed — the ask comes from what
 * similar roles publish. Pass `market: undefined` to leave those jobs without an ask
 * (Job Finder does: its salary guide card already gives the general figure once).
 */
export function jobInsights(job: JobLike, person: Person, market?: MarketRange | null): JobInsights | undefined {
  const base = insightsFor(job);
  const own = { currentCtcLpa: person.currentCtcLpa, minSalaryLpa: person.minSalaryLpa };

  const advice = job.salaryLpa
    ? recommendAsk({ ...own, posted: job.salaryLpa, postedBandPosition: bandPosition(person.experienceYears, job.minExperience, job.maxExperience) })
    : market === undefined
      ? null
      : recommendAsk({ ...own, market });
  if (!advice) return base;

  return {
    ...(base ?? { benefits: [] }),
    askLpa: advice.ask,
    askFloorLpa: advice.floor,
    askBasis: job.salaryLpa ? "posting" : market ? "market" : "personal",
  };
}
