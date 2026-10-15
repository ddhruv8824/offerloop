import { handleRedlineRequest } from "@offerloop/resume-studio/server";

/**
 * Resume Studio's API: /api/redline/api/v1/... runs the Redline engine in this
 * process (see modules/resume-studio/src/server). Tailoring progress streams back
 * as Server-Sent Events.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A tailoring run is two AI calls; give slow models room on hosts that cap request time.
export const maxDuration = 300;

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleRedlineRequest(req, (await params).path);
}

export { handle as GET, handle as POST, handle as PUT };
