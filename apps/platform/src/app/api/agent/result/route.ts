import { FINAL_STATUSES, report, type AgentReport } from "@/lib/apply-queue";
import { isAgentRequest, notAgent } from "@/lib/server/agent-auth";
import { updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const ACCEPTED: AgentReport[] = [...FINAL_STATUSES, "requeue"];

/** The job agent reports what happened with one job it took. */
export async function POST(req: Request) {
  if (!(await isAgentRequest(req))) return notAgent();
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; message?: unknown };
  if (typeof body.id !== "string" || !ACCEPTED.includes(body.status as AgentReport)) {
    return Response.json({ error: "Send { id, status, message }." }, { status: 400 });
  }
  const item = await updateStore((data) => {
    if (data.agent) data.agent.lastSeenAt = new Date().toISOString();
    return report(data.applyQueue, body.id as string, body.status as AgentReport, typeof body.message === "string" ? body.message : undefined);
  });
  if (!item) return Response.json({ error: "That job isn't waiting for a result (already reported, or not taken)." }, { status: 409 });
  return Response.json({ ok: true, status: item.status });
}
