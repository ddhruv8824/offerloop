import { NextResponse, type NextRequest } from "next/server";
import { resendApproval, StepFailure } from "@/lib/server/automations/engine";
import { sendAndRecord, signalConfigured } from "@/lib/server/notify/signal";
import { readStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Whether Signal alerts are set up (never the number or key), and how the last message went. */
export async function GET() {
  const { signalLast } = await readStore();
  return NextResponse.json({ configured: signalConfigured(), last: signalLast ?? null });
}

/** { } sends a test message; { resend: runId } sends a waiting run's approval message again. */
export async function POST(req: NextRequest) {
  if (!signalConfigured()) {
    return NextResponse.json({ error: "Signal isn't set up yet: add SIGNAL_PHONE and SIGNAL_CALLMEBOT_KEY in Render → Environment." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { resend?: unknown };
  try {
    const result =
      typeof body.resend === "string"
        ? await resendApproval(body.resend)
        : await sendAndRecord("test", "Offerloop: test message. You'll get a message like this when a workflow is waiting for your approval.");
    return result.ok ? NextResponse.json({ ok: true, last: result }) : NextResponse.json({ error: result.detail, last: result }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof StepFailure ? err.message : "Couldn't send it." }, { status: 400 });
  }
}
