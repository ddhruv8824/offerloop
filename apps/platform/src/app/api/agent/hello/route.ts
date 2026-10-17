import { DAILY_APPLY_LIMIT, startedToday } from "@/lib/apply-queue";
import { isAgentRequest, notAgent } from "@/lib/server/agent-auth";
import { updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** The job agent checks in: is its key valid, and how much is waiting? */
export async function GET(req: Request) {
  if (!(await isAgentRequest(req))) return notAgent();
  const status = await updateStore((data) => {
    if (data.agent) data.agent.lastSeenAt = new Date().toISOString();
    return {
      queued: data.applyQueue.filter((q) => q.status === "queued").length,
      remainingToday: Math.max(0, DAILY_APPLY_LIMIT - startedToday(data.applyQueue)),
      dailyLimit: DAILY_APPLY_LIMIT,
    };
  });
  return Response.json({ ok: true, ...status });
}
