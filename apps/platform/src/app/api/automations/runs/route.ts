import { NextResponse, type NextRequest } from "next/server";
import { approveRun, cancelRun, markApplySynced, markTrackerApplied, StepFailure } from "@/lib/server/automations/engine";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * Act on a run: approve the jobs to keep, cancel it, confirm its jobs reached the Tracker,
 * or confirm Hirist apply results reached the Tracker ("apply-synced", with the queue item ids).
 */
export const POST = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; runId?: unknown; jobIds?: unknown };
  if (typeof body.runId !== "string" && body.action !== "apply-synced") return NextResponse.json({ error: "Which run?" }, { status: 400 });
  try {
    if (body.action === "approve") {
      const jobIds = Array.isArray(body.jobIds) ? body.jobIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      await approveRun(user.id, body.runId as string, jobIds);
    } else if (body.action === "cancel") {
      await cancelRun(user.id, body.runId as string);
    } else if (body.action === "apply-synced") {
      const ids = Array.isArray(body.jobIds) ? body.jobIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      await markApplySynced(user.id, ids);
    } else if (body.action === "tracker-applied") {
      await markTrackerApplied(user.id, body.runId as string);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StepFailure) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[automations] run action failed:", err);
    return NextResponse.json({ error: "That didn't work. Try again." }, { status: 500 });
  }
});
