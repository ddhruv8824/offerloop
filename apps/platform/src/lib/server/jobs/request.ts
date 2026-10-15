// Server only. Validate the profile a browser sends with a job request.
import type { SearchProfile } from "@/lib/jobs";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const texts = (v: unknown, maxItems: number, max: number) =>
  Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, maxItems) : [];
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

/** Returns null when there's no usable target role. */
export function parseProfile(raw: unknown): SearchProfile | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const targetRole = text(p.targetRole, 80);
  if (targetRole.length < 2) return null;
  return {
    targetRole,
    skills: texts(p.skills, 60, 40),
    locations: texts(p.locations, 12, 40),
    experienceYears: num(p.experienceYears, 0, 50) ?? 0,
    minSalaryLpa: num(p.minSalaryLpa, 0, 1000),
    currentCtcLpa: num(p.currentCtcLpa, 0, 1000),
    dealBreakers: texts(p.dealBreakers, 20, 60),
  };
}
