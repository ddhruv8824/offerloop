import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, exchangeCode, seal, STATE_COOKIE, TOKEN_COOKIE } from "@/lib/server/inbox";
import { publicSite, publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

const back = (req: NextRequest, result: string) => publicUrl(req, `/tracker?inbox=${result}`);

/** Google sends the user back here with a code; swap it for a refresh token and keep it sealed in a cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;

  if (req.nextUrl.searchParams.get("error")) return NextResponse.redirect(back(req, "cancelled"));
  if (!code || !state || state !== expected) return NextResponse.redirect(back(req, "failed"));

  try {
    const stored = await exchangeCode(code, publicSite(req));
    const res = NextResponse.redirect(back(req, "connected"));
    res.cookies.set(TOKEN_COOKIE, seal(stored), cookieOptions(60 * 60 * 24 * 180));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("[inbox] Google sign-in failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(back(req, "failed"));
  }
}
