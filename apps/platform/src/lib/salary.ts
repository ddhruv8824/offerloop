/**
 * "What CTC should I ask for?" — pure maths, no storage, no network, no imports.
 *
 * Two inputs do the work:
 *   1. a market range, built from postings for similar roles that publish their pay;
 *   2. the person's own numbers (current CTC, the minimum they'd accept).
 * Every answer says what it is based on and how much data is behind it. It is a
 * starting point for a negotiation, not a prediction.
 */

/** One posting that stated its pay. */
export interface SalaryObservation {
  jobId: string;
  title: string;
  company: string;
  location: string;
  /** LPA. `min` is 0 when the posting only said "up to". */
  min: number;
  max: number;
  minExperience?: number;
  maxExperience?: number;
  source: string;
  seenAt: string;
}

export type Confidence = "good" | "fair" | "low";

export interface MarketRange {
  /** Typical bottom and top of the published ranges, LPA. */
  low: number;
  high: number;
  /** What those postings point to for someone with this person's experience, LPA. */
  typical: number;
  postings: number;
  /** What the range covers, e.g. "Frontend Developer roles for about 2 years' experience in Bangalore". */
  basis: string;
  confidence: Confidence;
}

export interface MarketTarget {
  targetRole: string;
  experienceYears: number;
  locations: string[];
}

/** How the caller judges "same kind of role" and "same place" (Job Finder's own matchers). */
export interface MarketMatchers {
  sameRole: (title: string) => boolean;
  sameCity: (location: string) => boolean;
}

const MIN_POSTINGS = 3;
const ENOUGH_POSTINGS = 5;

const half = (n: number) => Math.round(n * 2) / 2;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A posting is aimed at this much experience if the person is inside its band, give or take a year. */
function experienceFits(o: SalaryObservation, years: number) {
  if (o.minExperience !== undefined && o.minExperience > years + 1) return false;
  if (o.maxExperience !== undefined && o.maxExperience > 0 && o.maxExperience < years) return false;
  return true;
}

const sane = (o: SalaryObservation) => o.max >= 1 && o.max <= 200 && o.min >= 0 && o.min <= o.max;

/**
 * Where someone with `years` of experience sits in a posting's experience band, 0 (the
 * least experienced person it's aimed at) to 1 (the most). A range like "22–25 LPA for
 * 3–8 years" pays its top to the 8-year person, not the 3-year one. Unknown band → the middle.
 */
export function bandPosition(years: number, minExperience?: number, maxExperience?: number): number {
  if (minExperience === undefined || maxExperience === undefined || maxExperience <= minExperience) return 0.5;
  return Math.min(1, Math.max(0, (years - minExperience) / (maxExperience - minExperience)));
}

function summarise(group: SalaryObservation[], basis: string, years: number): MarketRange {
  // "Up to X" postings say nothing about the bottom of a range, so they only count for the top.
  const lows = group.filter((o) => o.min > 0).map((o) => o.min);
  const highs = group.map((o) => o.max);
  const high = half(median(highs));
  const low = half(lows.length ? Math.min(median(lows), high) : high * 0.7);
  // What each posting would pay this person, given where they sit in its experience band.
  const forYou = group.map((o) => {
    const bottom = o.min > 0 ? o.min : o.max * 0.7;
    return bottom + (o.max - bottom) * bandPosition(years, o.minExperience, o.maxExperience);
  });
  const typical = half(Math.min(high, Math.max(low, median(forYou))));
  return { low, high, typical, postings: group.length, basis, confidence: group.length >= 10 ? "good" : group.length >= ENOUGH_POSTINGS ? "fair" : "low" };
}

/**
 * The pay range similar roles publish. Tries the most specific group first (same role,
 * same experience, same city) and widens only when there are too few postings to say anything.
 * Returns null when even the widest group has fewer than 3 — better no answer than a made-up one.
 */
export function marketRange(observations: SalaryObservation[], target: MarketTarget, match: MarketMatchers): MarketRange | null {
  // One posting counts once, however many times it was seen.
  const unique = [...new Map(observations.filter(sane).map((o) => [o.jobId, o])).values()];
  const role = unique.filter((o) => match.sameRole(o.title));
  const years = target.experienceYears;
  const exp = role.filter((o) => experienceFits(o, years));
  const cities = target.locations.filter((c) => !/remote/i.test(c));
  const local = cities.length ? exp.filter((o) => match.sameCity(o.location)) : [];

  const about = `about ${years} ${years === 1 ? "year's" : "years'"} experience`;
  const tiers: [SalaryObservation[], string][] = [
    [local, `${target.targetRole} roles for ${about} in ${cities.join(" / ")}`],
    [exp, `${target.targetRole} roles for ${about}, across India`],
    [role, `${target.targetRole} roles at all experience levels, across India`],
  ];
  const usable = tiers.filter(([group]) => group.length >= MIN_POSTINGS);
  if (!usable.length) return null;
  // Prefer the most specific tier with enough data; otherwise the most specific one that has any.
  const [group, basis] = usable.find(([g]) => g.length >= ENOUGH_POSTINGS) ?? usable[0];
  return summarise(group, basis, years);
}

/* ── The ask ──────────────────────────────────────────── */

/** A switch usually comes with a raise; 30% over current pay is a common, defensible target in India. */
export const SWITCH_HIKE = 0.3;
/** Below this raise, a switch rarely pays for its own risk. */
const MIN_HIKE = 0.15;

export interface AskInput {
  /** Pay this posting itself states, if any. */
  posted?: [min: number, max: number];
  /** Where the person sits in that posting's experience band (see `bandPosition`), if known. */
  postedBandPosition?: number;
  market?: MarketRange | null;
  currentCtcLpa?: number;
  minSalaryLpa?: number;
}

export interface AskAdvice {
  /** The number to open with, LPA. */
  ask: number;
  /** Don't accept below this, LPA. */
  floor: number;
  /** Why, in plain sentences, most important first. */
  reasons: string[];
  /** Things to be careful about (ask above the posted top, thin data…). */
  cautions: string[];
  confidence: Confidence;
}

/**
 * The number to ask for and the number not to go below. Null when there's nothing to base
 * it on (no posted pay, no market data, no current CTC, no minimum).
 */
export function recommendAsk({ posted, postedBandPosition, market, currentCtcLpa, minSalaryLpa }: AskInput): AskAdvice | null {
  const current = currentCtcLpa && currentCtcLpa > 0 ? currentCtcLpa : undefined;
  const minimum = minSalaryLpa && minSalaryLpa > 0 ? minSalaryLpa : undefined;
  const hike = current ? current * (1 + SWITCH_HIKE) : undefined;
  const reasons: string[] = [];
  const cautions: string[] = [];

  // What the employer side supports: this posting's own range beats the general market.
  let ceiling: number | undefined;
  let anchor: number | undefined;
  let confidence: Confidence = "low";
  if (posted && posted[1] > 0) {
    const [lo, hi] = posted;
    ceiling = hi;
    // Where this person sits in the posting's experience band decides where in its range to aim
    // (a little above their literal position: the first number named is rarely the last).
    const position = Math.min(0.9, Math.max(0.25, (postedBandPosition ?? 0.5) + 0.1));
    anchor = lo > 0 ? lo + (hi - lo) * position : hi * 0.9;
    confidence = "good";
    reasons.push(
      lo > 0
        ? `This posting states ${lo}–${hi} LPA. ${postedBandPosition !== undefined && postedBandPosition <= 0.25 ? "You're at the junior end of the experience it asks for, so aim for the lower-middle of that range." : postedBandPosition !== undefined && postedBandPosition >= 0.75 ? "You're at the senior end of the experience it asks for, so aim near the top of that range." : "Aim for the middle-to-upper part of that range."}`
        : `This posting states up to ${hi} LPA.`,
    );
  } else if (market) {
    ceiling = market.high;
    anchor = market.typical;
    confidence = market.confidence;
    reasons.push(`Among ${market.basis}, the postings that publish pay offer ${market.low}–${market.high} LPA (${market.postings} postings). For your experience that points to about ${market.typical} LPA.`);
    if (market.confidence === "low") cautions.push(`Only ${market.postings} postings published pay, so treat the range as rough.`);
  }

  if (anchor === undefined && hike === undefined && minimum === undefined) return null;

  let ask = Math.max(anchor ?? 0, hike ?? 0, minimum ?? 0);
  if (hike !== undefined) {
    if (ask === hike) reasons.push(`A ${Math.round(SWITCH_HIKE * 100)}% raise on your current ${current} LPA is ${half(hike)} LPA — a normal target when switching.`);
    else reasons.push(`That is ${Math.round((ask / current! - 1) * 100)}% above your current ${current} LPA.`);
  }
  if (anchor === undefined) cautions.push("There's no published pay for similar roles yet, so this rests on your own numbers only.");
  // Asking the going rate is right even from a low base — but many employers anchor on current
  // pay, so a very large jump needs to be argued from the role and the market, not from the past.
  if (current && ask / current - 1 >= 0.8) {
    cautions.push(`That's a big jump from your current ${current} LPA. Many employers anchor on current pay, so make the case from the role and the going rate, not from what you earn now.`);
  }

  // Asking beyond what the employer side shows is possible, but the person should know.
  if (ceiling !== undefined && ask > ceiling) {
    cautions.push(
      posted
        ? `That's above this posting's stated top of ${ceiling} LPA — it may simply be below what you need.`
        : `That's above the top of what similar roles publish (${ceiling} LPA) — expect to justify it.`,
    );
  }

  const floor = Math.max(minimum ?? 0, current ? current * (1 + MIN_HIKE) : 0, anchor !== undefined && market && !posted ? market.low : 0, posted && posted[0] > 0 ? posted[0] : 0);
  ask = half(ask);
  return { ask, floor: Math.min(half(floor), ask), reasons, cautions, confidence };
}
