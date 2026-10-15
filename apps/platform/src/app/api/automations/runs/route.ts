import { NextResponse, type NextRequest } from "next/server";
import { approveRun, cancelRun, markTrackerApplied, StepFailure } from "@/lib/server/automations/engine";

export const dynamic = "force-dynamic";

/** Act on a run: approve the jobs to keep, cancel it, or confirm its jobs reached the Tracker. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; runId?: unknown; jobIds?: unknown };
  if (typeof body.runId !== "string") return NextResponse.json({ error: "Which run?" }, { status: 400 });
  try {
    if (body.action === "approve") {
      const jobIds = Array.isArray(body.jobIds) ? body.jobIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      await approveRun(body.runId, jobIds);
    } else if (body.action === "cancel") {
      await cancelRun(body.runId);
    } else if (body.action === "tracker-applied") {
      await markTrackerApplied(body.runId);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StepFailure) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[automations] run action failed:", err);
    return NextResponse.json({ error: "That didn't work. Try again." }, { status: 500 });
  }
}
