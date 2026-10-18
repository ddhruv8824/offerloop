import { NextResponse, type NextRequest } from "next/server";
import { startRun, StepFailure } from "@/lib/server/automations/engine";
import { parseProfile } from "@/lib/server/jobs/request";
import { updateStore } from "@/lib/server/store";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** "Run now". Returns as soon as the run is created; the steps continue in the background. */
export const POST = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { workflowId?: unknown; jobUrl?: unknown; profile?: unknown };
  if (typeof body.workflowId !== "string") return NextResponse.json({ error: "Which workflow?" }, { status: 400 });
  const jobUrl = typeof body.jobUrl === "string" && body.jobUrl.trim() ? body.jobUrl.trim().slice(0, 2000) : undefined;

  // Use the profile as it is right now, not as it was when the workflow was saved.
  const profile = parseProfile(body.profile);
  if (profile) await updateStore(user.id, (data) => void (data.profile = profile));

  try {
    const run = await startRun(user.id, body.workflowId, "manual", { jobUrl });
    return NextResponse.json({ run });
  } catch (err) {
    if (err instanceof StepFailure) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[automations] run failed to start:", err);
    return NextResponse.json({ error: "Couldn't start that workflow." }, { status: 500 });
  }
});
