import type { Company, PayBand } from "./types";

const half = (n: number) => Math.round(n * 2) / 2;

/**
 * What CTC to ask for, from a company's pay band for the role.
 * Ask in the upper half of the band (median → high) so there's room to settle
 * near the median; never ask below the candidate's own minimum.
 */
export function suggestAsk(band: PayBand, minSalaryLpa?: number) {
  const ask = half(Math.max(band.median + (band.high - band.median) / 2, minSalaryLpa ?? 0));
  const floor = half(Math.max(band.median, minSalaryLpa ?? 0));
  return {
    ask,
    floor,
    belowMinimum: minSalaryLpa != null && band.high < minSalaryLpa,
    confidence: band.dataPoints >= 10 ? "good" : band.dataPoints >= 5 ? "fair" : "low",
  } as const;
}

/** The pay band closest to a role title (simple word overlap; falls back to the first band). */
export function bandFor(company: Company, roleTitle: string): PayBand | undefined {
  const bands = company.insights?.pay ?? [];
  const words = new Set(roleTitle.toLowerCase().split(/\W+/));
  const score = (b: PayBand) => b.role.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
  return [...bands].sort((a, b) => score(b) - score(a))[0];
}
