import { DAILY_APPLY_LIMIT, reclaimStale, startedToday } from "@/lib/apply-queue";
import { isAgentRequest, notAgent } from "@/lib/server/agent-auth";
import { updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** The job agent checks in: is its key valid, and how much is waiting? */
export async function GET(req: Request) {
  if (!(await isAgentRequest(req))) return notAgent();
  const status = await updateStore((data) => {
    if (data.agent) data.agent.lastSeenAt = new Date().toISOString();
    reclaimStale(data.applyQueue);
    return {
      queued: data.applyQueue.filter((q) => q.status === "queued").length,
      remainingToday: Math.max(0, DAILY_APPLY_LIMIT - startedToday(data.applyQueue)),
      dailyLimit: DAILY_APPLY_LIMIT,
    };
  });
  return Response.json({ ok: true, ...status });
}

/**
 * The agent tells Offerloop whether it's stuck: { problem: "Not logged in to Hirist…" }, or
 * { problem: null } once it applied again. Shown on the Automations page, since a background
 * agent has nobody watching its window.
 */
export async function POST(req: Request) {
  if (!(await isAgentRequest(req))) return notAgent();
  const body = (await req.json().catch(() => ({}))) as { problem?: unknown };
  const problem = typeof body.problem === "string" && body.problem.trim() ? body.problem.trim().slice(0, 300) : null;
  await updateStore((data) => {
    if (!data.agent) return;
    data.agent.lastSeenAt = new Date().toISOString();
    if (problem) data.agent.problem = { message: problem, at: data.agent.lastSeenAt };
    else delete data.agent.problem;
  });
  return Response.json({ ok: true });
}
