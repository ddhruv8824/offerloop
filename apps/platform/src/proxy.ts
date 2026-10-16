import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isLoggedIn } from "@/lib/server/site-auth";
import { publicUrl } from "@/lib/server/public-url";

/**
 * The site password (see lib/server/site-auth.ts): every page and API needs a login
 * when APP_PASSWORD is set. Pages send you to /login; APIs answer 401.
 */
export function proxy(req: NextRequest) {
  if (isLoggedIn(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Log in first.", detail: "Log in first." }, { status: 401 });
  }
  const login = publicUrl(req, "/login");
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login itself, Next's static files and images, and the backup
  // scheduler trigger (it checks its own CRON_SECRET).
  matcher: ["/((?!login|api/login|api/automations/tick|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
