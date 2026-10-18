import { NextResponse } from "next/server";
import { memberRoute } from "@/lib/server/auth/session";
import { resendApproval, StepFailure } from "@/lib/server/automations/engine";
import { sendAndRecord, signalCreds } from "@/lib/server/notify/signal";
import { seal } from "@/lib/server/secret-box";
import { readStore, updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const masked = (phone: string) => (phone.length > 8 ? `${phone.slice(0, 4)}…${phone.slice(-4)}` : "••••");

/** Whether your Signal alerts are set up (never the key), and how the last message went. */
export const GET = memberRoute(async (_req, _ctx, user) => {
  const data = await readStore(user.id);
  const creds = signalCreds(data);
  return NextResponse.json({ configured: Boolean(creds), phone: creds ? masked(creds.phone) : null, last: data.signalLast ?? null });
});

/**
 * { phone, apikey } saves your CallMeBot details · { remove: true } removes them ·
 * { resend: runId } sends a waiting run's approval message again · {} sends a test message.
 */
export const POST = memberRoute(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { resend?: unknown; phone?: unknown; apikey?: unknown; remove?: unknown };

  if (body.remove === true) {
    await updateStore(user.id, (d) => {
      delete d.signal;
      delete d.signalLast;
    });
    return NextResponse.json({ ok: true, configured: false });
  }
  if (typeof body.phone === "string" || typeof body.apikey === "string") {
    const phone = String(body.phone ?? "").trim();
    const apikey = String(body.apikey ?? "").trim();
    if (!/^[A-Za-z0-9+_-]{6,64}$/.test(phone)) return NextResponse.json({ error: "Paste the phone= value from CallMeBot's link (an id like c242bb7d-… or +91…)." }, { status: 400 });
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(apikey)) return NextResponse.json({ error: "Paste the API key CallMeBot sent you." }, { status: 400 });
    await updateStore(user.id, (d) => {
      d.signal = { phone, keyBox: seal(apikey), savedAt: new Date().toISOString() };
    });
    return NextResponse.json({ ok: true, configured: true, phone: masked(phone) });
  }

  const creds = signalCreds(await readStore(user.id));
  if (!creds) return NextResponse.json({ error: "Add your CallMeBot details first." }, { status: 400 });
  try {
    const result =
      typeof body.resend === "string"
        ? await resendApproval(user.id, body.resend)
        : await sendAndRecord(user.id, creds, "test", "Offerloop: test message. You'll get a message like this when a workflow is waiting for your approval.");
    return result.ok ? NextResponse.json({ ok: true, last: result }) : NextResponse.json({ error: result.detail, last: result }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof StepFailure ? err.message : "Couldn't send it." }, { status: 400 });
  }
});
