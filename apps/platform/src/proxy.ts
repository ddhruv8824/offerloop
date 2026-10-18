import { NextResponse, type NextRequest } from "next/server";
import { authMode } from "@/lib/server/auth/config";
import { supabaseProxy } from "@/lib/server/auth/supabase";
import { publicUrl } from "@/lib/server/public-url";
import { AUTH_COOKIE, isLoggedIn } from "@/lib/server/site-auth";

/** Pages and APIs anyone can open, signed in or not. */
const PUBLIC = [/^\/$/, /^\/(login|signup|forgot|privacy|terms)$/, /^\/docs(\/|$)/, /^\/auth\//, /^\/api\/auth\//];
const isPublic = (pathname: string) => PUBLIC.some((re) => re.test(pathname));

function toLogin(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Log in first.", detail: "Log in first." }, { status: 401 });
  }
  const login = publicUrl(req, "/login");
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

/**
 * Runs before every page and API (except those in `config.matcher`'s exclusions).
 *
 * Accounts (Supabase configured): keeps the sign-in session fresh, sends signed-out visitors
 * to /login, and signed-in ones away from /login. Whether someone is a *member* (has used an
 * invite code) is checked by the app pages and APIs themselves.
 *
 * Single user: the optional site password (APP_PASSWORD, see lib/server/site-auth.ts).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (authMode() === "single") {
    if (isPublic(pathname) || isLoggedIn(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
    return toLogin(req);
  }

  const { client, response } = supabaseProxy(req, () => NextResponse.next({ request: req }));
  let signedIn = false;
  try {
    const { data } = await client.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    // Supabase unreachable: treat as signed out for protected pages, let public ones through.
  }
  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(publicUrl(req, req.nextUrl.searchParams.get("next") || "/dashboard"));
  }
  if (!signedIn && !isPublic(pathname)) return toLogin(req);
  return response();
}

export const config = {
  // Everything except Next's static files and images, the health check, the backup scheduler
  // trigger (it checks its own CRON_SECRET), the job agent's API (it checks its own key), the
  // single-user password login, and one-tap approval links (the link's secret is the permission).
  matcher: ["/((?!api/login|api/health|api/automations/tick|api/agent/|a/|api/a/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
