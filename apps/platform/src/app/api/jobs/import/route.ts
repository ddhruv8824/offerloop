import { NextResponse, type NextRequest } from "next/server";
import { scoreJob } from "@/lib/jobs";
import { ImportError, importJob } from "@/lib/server/jobs/import";
import { parseProfile } from "@/lib/server/jobs/request";

export const dynamic = "force-dynamic";

/** "Paste a link": read one job posting and score it for this profile. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; profile?: unknown };
  const profile = parseProfile(body.profile);
  if (!profile) return NextResponse.json({ error: "Add a target role to your profile first." }, { status: 400 });
  if (typeof body.url !== "string" || body.url.length > 2000) return NextResponse.json({ error: "Paste a job link." }, { status: 400 });
  try {
    const job = await importJob(body.url);
    return NextResponse.json({ job: scoreJob(job, profile, { keepAll: true }) });
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[jobs] import failed:", err instanceof Error ? err.message : err);
    // The real reason helps while developing; never expose internals in production.
    const detail = process.env.NODE_ENV !== "production" && err instanceof Error ? err.stack?.split(/\r?\n/).slice(0, 4).join(" | ") : undefined;
    return NextResponse.json({ error: "Couldn't read that link.", detail }, { status: 502 });
  }
}
