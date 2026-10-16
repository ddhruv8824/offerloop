// Server only. The address people reach the site at. Behind a reverse proxy (Caddy, a
// host's load balancer) Next.js sees its own local address, e.g. http://localhost:3100,
// so redirects and the Gmail sign-in callback must not be built from req.url.
//
// PUBLIC_URL (e.g. https://offerloop.example.com) wins, then the address Render sets on
// its services (RENDER_EXTERNAL_URL), then the proxy's X-Forwarded-* headers, then Host.

export function publicOrigin(req: Request): string {
  const configured = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL)?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  return host ? `${proto}://${host}` : url.origin;
}

/** An absolute URL on this site for `path`. */
export const publicUrl = (req: Request, path: string) => new URL(path, publicOrigin(req));
