import { NextResponse } from "next/server";
import { sendSignal, signalConfigured } from "@/lib/server/notify/signal";

export const dynamic = "force-dynamic";

/** Whether Signal alerts are set up on the server (never the number or key). */
export async function GET() {
  return NextResponse.json({ configured: signalConfigured() });
}

/** Send a test message. */
export async function POST() {
  if (!signalConfigured()) {
    return NextResponse.json({ error: "Signal isn't set up yet: add SIGNAL_PHONE and SIGNAL_CALLMEBOT_KEY in Render → Environment." }, { status: 400 });
  }
  try {
    await sendSignal("Offerloop: test message. You'll get a message like this when a workflow is waiting for your approval.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't send it." }, { status: 502 });
  }
}
