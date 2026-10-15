import { NextResponse, type NextRequest } from "next/server";
import { parseProfile } from "@/lib/server/jobs/request";
import { searchJobs } from "@/lib/server/jobs/search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Find open roles for this profile across Hirist and company career boards. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { profile?: unknown };
  const profile = parseProfile(body.profile);
  if (!profile) return NextResponse.json({ error: "Add a target role to your profile first." }, { status: 400 });
  try {
    return NextResponse.json(await searchJobs(profile));
  } catch (err) {
    console.error("[jobs] search failed:", err instanceof Error ? err.message : err);
    // The real reason helps while developing; never expose internals in production.
    const detail = process.env.NODE_ENV !== "production" && err instanceof Error ? err.stack?.split(/\r?\n/).slice(0, 4).join(" | ") : undefined;
    return NextResponse.json({ error: "Job search failed. Try again in a minute.", detail }, { status: 502 });
  }
}
