// Server only. The address people reach the site at. Behind a reverse proxy (Caddy, a
// host's load balancer) Next.js sees its own local address, e.g. http://localhost:3100,
// so redirects and the Gmail sign-in callback must not be built from req.url.
//
// PUBLIC_URL (e.g. https://offerloop.example.com) wins, then the address Render sets on
// its services (RENDER_EXTERNAL_URL), then the proxy's X-Forwarded-* headers, then Host.
// Only its origin is used; the app's own path (BASE_PATH, e.g. /offerloop) is added here.
import { BASE_PATH } from "@/lib/base-path";

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
};

/** The configured origin, e.g. "https://example.com", or "" when none is set. */
const configuredOrigin = () => {
  const configured = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL)?.trim();
  return configured ? originOf(configured) : "";
};

/** "https://example.com" — no path. */
export function publicOrigin(req: Request): string {
  const configured = configuredOrigin();
  if (configured) return configured;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  return host ? `${proto}://${host}` : url.origin;
}

/** Where the app starts: "https://example.com/offerloop" (or the origin, with no base path). */
export const publicSite = (req: Request) => `${publicOrigin(req)}${BASE_PATH}`;

/** An absolute URL on this site for an app path like "/login". */
export const publicUrl = (req: Request, path: string) => new URL(`${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`, publicOrigin(req));

/** Where the app starts, from settings alone (no request at hand), or "" when unknown. */
export function configuredSite(): string {
  const origin = configuredOrigin();
  return origin ? `${origin}${BASE_PATH}` : "";
}
