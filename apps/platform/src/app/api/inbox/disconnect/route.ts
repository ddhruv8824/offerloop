import { NextResponse, type NextRequest } from "next/server";
import { revoke, TOKEN_COOKIE, unseal } from "@/lib/server/inbox";

export const dynamic = "force-dynamic";

/** Revoke Google access and forget the token. */
export async function POST(req: NextRequest) {
  const stored = unseal(req.cookies.get(TOKEN_COOKIE)?.value);
  if (stored) await revoke(stored.refreshToken);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(TOKEN_COOKIE);
  return res;
}
