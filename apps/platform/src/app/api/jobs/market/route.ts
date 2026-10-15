import { NextResponse, type NextRequest } from "next/server";
import { salaryMarket } from "@/lib/server/jobs/market";
import { parseProfile } from "@/lib/server/jobs/request";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What roles like this person's target pay, from postings that publish their salary.
 * The first call for a role takes ~20 seconds (it samples a few hundred postings); after
 * that it answers from what's stored, and re-samples at most twice a day.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { profile?: unknown };
  const profile = parseProfile(body.profile);
  if (!profile) return NextResponse.json({ error: "Add a target role to your profile first." }, { status: 400 });
  try {
    return NextResponse.json(await salaryMarket(profile));
  } catch (err) {
    console.error("[market] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't build the salary guide right now." }, { status: 502 });
  }
}
