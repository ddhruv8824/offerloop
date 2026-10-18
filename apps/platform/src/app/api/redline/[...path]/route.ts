import { handleRedlineRequest } from "@offerloop/resume-studio/server";
import { authMode } from "@/lib/server/auth/config";
import { memberRoute } from "@/lib/server/auth/session";

/**
 * Resume Studio's API: /api/redline/api/v1/... runs the Redline engine in this
 * process (see modules/resume-studio/src/server). Tailoring progress streams back
 * as Server-Sent Events. With accounts, every request is pinned to the signed-in
 * person's own workspace, whatever the browser asks for.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A tailoring run is two AI calls; give slow models room on hosts that cap request time.
export const maxDuration = 300;

const handle = memberRoute<Request, { params: Promise<{ path: string[] }> }>(async (req, { params }, user) =>
  handleRedlineRequest(req, (await params).path, authMode() === "accounts" ? { workspace: user.id } : {}),
);

export { handle as GET, handle as POST, handle as PUT };
