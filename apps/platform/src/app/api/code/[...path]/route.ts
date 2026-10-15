import type { NextRequest } from "next/server";

/**
 * Same-port proxy to the Code Runner API:
 * /api/code/... → CODE_RUNNER_INTERNAL_URL/api/v1/code/...
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = (process.env.CODE_RUNNER_INTERNAL_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

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
  // The "local" executor runs submitted code directly on this machine. Fine on your own laptop;
  // on a public server it lets any visitor run any program. In production, only the sandboxed
  // Judge0 executor (CODE_EXECUTOR=judge0) may run code.
  if (path[0] === "run" && process.env.NODE_ENV === "production" && (process.env.CODE_EXECUTOR ?? "local").toLowerCase() !== "judge0") {
    return Response.json({ detail: "Running code is turned off on this server: it needs the Judge0 sandbox (CODE_EXECUTOR=judge0)." }, { status: 503 });
  }
  const url = `${UPSTREAM}/api/v1/code/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
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
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: req.signal,
      cache: "no-store",
    } as RequestInit);
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error("[code runner proxy] upstream request failed:", err instanceof Error ? err.message : err, cause);
    return Response.json(
      { detail: "Couldn't reach Code Runner engine on http://127.0.0.1:8001." },
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
