import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, TOKEN_COOKIE, unseal } from "@/lib/server/inbox";

export const dynamic = "force-dynamic";

/** Is Gmail set up on this server, and is this browser connected? */
export function GET(req: NextRequest) {
  const stored = unseal(req.cookies.get(TOKEN_COOKIE)?.value);
  return NextResponse.json({
    configured: isConfigured(),
    connected: Boolean(stored),
    email: stored?.email ?? null,
    sampleAvailable: process.env.NODE_ENV !== "production",
  });
}
