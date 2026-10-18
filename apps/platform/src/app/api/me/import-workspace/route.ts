import { NextResponse } from "next/server";
import { copyWorkspace } from "@offerloop/resume-studio/server";
import { authMode } from "@/lib/server/auth/config";
import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * Bring this browser's Resume Studio workspace (from before accounts) into your account's
 * workspace: { workspace: "<old id>" }. Only fills an empty account workspace, once.
 */
export const POST = memberRoute(async (req, _ctx, user) => {
  if (authMode() !== "accounts") return NextResponse.json({ ok: true, copied: false });
  const body = (await req.json().catch(() => ({}))) as { workspace?: unknown };
  const from = typeof body.workspace === "string" ? body.workspace.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(from) || from === user.id) return NextResponse.json({ ok: true, copied: false });
  try {
    return NextResponse.json({ ok: true, copied: await copyWorkspace(from, user.id) });
  } catch {
    return NextResponse.json({ ok: true, copied: false });
  }
});
