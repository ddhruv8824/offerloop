import { remove } from "@/lib/apply-queue";
import { updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Take an approved Hirist job back before the job agent applies to it (behind the site password). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
  if (body.action !== "remove" || typeof body.id !== "string") return Response.json({ error: "Send { action: \"remove\", id }." }, { status: 400 });
  const item = await updateStore((data) => remove(data.applyQueue, body.id as string));
  if (!item) return Response.json({ error: "Too late — the agent has already started on this job." }, { status: 409 });
  return Response.json({ ok: true });
}
