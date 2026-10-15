import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/server/automations/scheduler";

export const dynamic = "force-dynamic";

/**
 * Backup trigger for hosts that put the server to sleep: an outside timer (a free
 * GitHub Actions schedule, cron-job.org, the host's own cron) calls this every few minutes:
 *
 *   curl -X POST https://your-site/api/automations/tick -H "Authorization: Bearer $CRON_SECRET"
 *
 * Disabled unless CRON_SECRET is set. It runs the same check as the built-in timer, so
 * calling both is harmless — a schedule slot can only ever start one run.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return NextResponse.json({ error: "Not enabled." }, { status: 404 });
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  return NextResponse.json(await tick());
}
