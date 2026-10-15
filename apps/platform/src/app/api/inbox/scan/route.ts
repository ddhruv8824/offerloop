import { NextResponse, type NextRequest } from "next/server";
import { classifyAll, SAMPLE_EMAILS, scanGmail, TOKEN_COOKIE, unseal } from "@/lib/server/inbox";

export const dynamic = "force-dynamic";

interface ScanBody {
  companies?: unknown;
  days?: unknown;
  skip?: unknown;
  sample?: unknown;
}

const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, max).map((s) => s.slice(0, 120)) : [];

/**
 * Look for application updates in the connected inbox.
 * Returns only classifications + sender/subject/date — never email bodies.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as ScanBody;
  const companies = strings(body.companies, 50);
  const skip = new Set(strings(body.skip, 2000));
  const days = Math.min(90, Math.max(1, Number(body.days) || 30));

  if (body.sample === true) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available." }, { status: 404 });
    const emails = SAMPLE_EMAILS.filter((e) => !skip.has(e.id));
    return NextResponse.json({ checked: emails.length, checkedIds: emails.map((e) => e.id), detections: classifyAll(emails), sample: true });
  }

  const stored = unseal(req.cookies.get(TOKEN_COOKIE)?.value);
  if (!stored) return NextResponse.json({ error: "Gmail isn't connected." }, { status: 401 });

  try {
    return NextResponse.json(await scanGmail(stored.refreshToken, companies, days, skip));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbox] scan failed:", message);
    const expired = /invalid_grant|401/.test(message);
    return NextResponse.json(
      { error: expired ? "Gmail access expired or was removed. Connect again." : "Couldn't read Gmail right now. Try again in a minute." },
      { status: expired ? 401 : 502 },
    );
  }
}
