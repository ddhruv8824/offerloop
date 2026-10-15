import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, cookieOptions, isConfigured, STATE_COOKIE } from "@/lib/server/inbox";

export const dynamic = "force-dynamic";

/** Start Google sign-in. The random state cookie is checked in the callback (CSRF). */
export function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(new URL("/tracker?inbox=not-configured", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(req.nextUrl.origin, state));
  res.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  return res;
}
