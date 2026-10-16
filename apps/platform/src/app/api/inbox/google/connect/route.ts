import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, cookieOptions, isConfigured, STATE_COOKIE } from "@/lib/server/inbox";
import { publicOrigin, publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

/** Start Google sign-in. The random state cookie is checked in the callback (CSRF). */
export function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(publicUrl(req, "/tracker?inbox=not-configured"));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(publicOrigin(req), state));
  res.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  return res;
}
