import { createAgentKey, revokeAgentKey } from "@/lib/server/agent-auth";

export const dynamic = "force-dynamic";

/**
 * The Automations page manages the job agent's key (behind the site password):
 * POST makes a new key and returns it once; DELETE disconnects the agent.
 */
export async function POST() {
  return Response.json({ key: await createAgentKey() });
}

export async function DELETE() {
  await revokeAgentKey();
  return Response.json({ ok: true });
}
