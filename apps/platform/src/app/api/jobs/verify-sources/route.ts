import { NextResponse } from "next/server";
import { mapLimit, SourceError } from "@/lib/server/jobs/http";
import { fetchCompany } from "@/lib/server/jobs/search";
import { CANDIDATES, SOURCES } from "@/lib/server/jobs/sources";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const INDIA = /india|bengaluru|bangalore|pune|mumbai|hyderabad|gurgaon|gurugram|noida|delhi|chennai/i;
const ANYONE = { targetRole: "Software Engineer", skills: [], locations: [], experienceYears: 0, dealBreakers: [] };

/**
 * Development only: which company boards actually respond from this machine, and how many
 * India roles each has. Use it to move entries from CANDIDATES into SOURCES.
 */
export const GET = memberRoute(async (req, _ctx, user) => {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const which = new URL(req.url).searchParams.get("list") === "sources" ? SOURCES : CANDIDATES;
  const rows = await mapLimit(which, 8, async (source) => {
    try {
      const jobs = await fetchCompany(source, ANYONE);
      return { ...source, ok: true, jobs: jobs.length, india: jobs.filter((j) => INDIA.test(j.location)).length };
    } catch (err) {
      return { ...source, ok: false, jobs: 0, india: 0, error: err instanceof SourceError ? err.message : "failed" };
    }
  });
  return NextResponse.json({ checked: rows.length, responding: rows.filter((r) => r.ok).length, rows: rows.sort((a, b) => b.india - a.india) });
});
