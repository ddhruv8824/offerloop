import type { NextRequest } from "next/server";

/**
 * Same-port proxy to the Redline API: /api/redline/api/v1/... → REDLINE_INTERNAL_URL/api/v1/...
 *
 * The browser only ever talks to this app; the Python service listens on
 * 127.0.0.1 and is never exposed. Bodies stream both ways, so resume uploads
 * pass through and tailoring progress (Server-Sent Events) arrives live.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = (process.env.REDLINE_INTERNAL_URL ?? "http://127.0.0.1:8100").replace(/\/$/, "");

// Hop-by-hop and length/encoding headers are recomputed by each side. `expect` (curl sends
// "100-continue" for bodies over 1 MB) is rejected outright by Node's fetch.
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "origin",
  "referer",
  "cookie",
]);
const DROP_RESPONSE = new Set(["connection", "content-length", "content-encoding", "transfer-encoding", "keep-alive"]);

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Only Redline's API — not its /docs or anything else on that port.
  if (path[0] !== "api" || path[1] !== "v1") {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }

  const url = `${UPSTREAM}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by Node's fetch to stream a request body (e.g. a resume upload).
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: req.signal, // the browser cancelling a tailoring run cancels it upstream too
      cache: "no-store",
    } as RequestInit);
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error("[redline proxy] upstream request failed:", err instanceof Error ? err.message : err, cause);
    return Response.json(
      { detail: "Couldn't reach Resume Studio's engine. If it isn't running, start everything with `pnpm dev` in the offerloop folder." },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
