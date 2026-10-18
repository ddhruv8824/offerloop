import { createAgentKey, revokeAgentKey } from "@/lib/server/agent-auth";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * The Automations page manages the job agent's key (behind the site password):
 * POST makes a new key and returns it once; DELETE disconnects the agent.
 */
export const POST = memberRoute(async (_req, _ctx, user) => {
  return Response.json({ key: await createAgentKey(user.id) });
});

export const DELETE = memberRoute(async (_req, _ctx, user) => {
  await revokeAgentKey(user.id);
  return Response.json({ ok: true });
});
