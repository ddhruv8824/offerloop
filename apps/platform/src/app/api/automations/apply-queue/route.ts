import { remove } from "@/lib/apply-queue";
import { updateStore } from "@/lib/server/store";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Take an approved Hirist job back before the job agent applies to it (behind the site password). */
export const POST = memberRoute(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
  if (body.action !== "remove" || typeof body.id !== "string") return Response.json({ error: "Send { action: \"remove\", id }." }, { status: 400 });
  const item = await updateStore(user.id, (data) => remove(data.applyQueue, body.id as string));
  if (!item) return Response.json({ error: "Too late — the agent has already started on this job." }, { status: 409 });
  return Response.json({ ok: true });
});
