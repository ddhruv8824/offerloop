import { claim } from "@/lib/apply-queue";
import { isAgentRequest, notAgent } from "@/lib/server/agent-auth";
import { updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * The job agent takes work: up to `want` approved jobs (default 1), within today's limit.
 * Taken jobs are marked in progress until the agent reports back (or 30 minutes pass).
 */
export async function POST(req: Request) {
  if (!(await isAgentRequest(req))) return notAgent();
  const body = (await req.json().catch(() => ({}))) as { want?: unknown };
  const want = Math.max(1, Math.min(15, Number(body.want) || 1));
  const result = await updateStore((data) => {
    if (data.agent) data.agent.lastSeenAt = new Date().toISOString();
    const { items, remainingToday } = claim(data.applyQueue, { want });
    return {
      remainingToday,
      jobs: items.map(({ id, hiristId, title, company, location, url }) => ({ id, hiristId, title, company, location, url })),
    };
  });
  return Response.json(result);
}
