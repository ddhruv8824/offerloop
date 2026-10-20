import { loadWorkspace, readTailoredVersion } from "@offerloop/resume-studio/server";
import { resumePdfBuffer } from "@offerloop/resume-studio/pdf";
import { agentUser, notAgent } from "@/lib/server/agent-auth";
import { readStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A resume as PDF, for the job agent to put on your Hirist profile:
 *   ?item=<apply-queue id>  the resume tailored to that job
 *   ?main=1                 your Resume Studio resume as it is (to put back afterwards)
 */
export async function GET(req: Request) {
  const uid = await agentUser(req);
  if (!uid) return notAgent();
  const params = new URL(req.url).searchParams;
  const itemId = params.get("item");

  let resume;
  if (itemId) {
    const item = (await readStore(uid)).applyQueue.find((q) => q.id === itemId);
    if (!item?.resumeVersionId) return Response.json({ error: "No tailored resume for that job." }, { status: 404 });
    resume = (await readTailoredVersion(uid, item.resumeVersionId))?.resume;
    if (!resume) return Response.json({ error: "That tailored resume was deleted in Resume Studio." }, { status: 404 });
  } else if (params.get("main") === "1") {
    resume = (await loadWorkspace(uid)).current_resume;
    if (!resume) return Response.json({ error: "No resume in Resume Studio yet." }, { status: 404 });
  } else {
    return Response.json({ error: "Ask for ?item=<id> or ?main=1." }, { status: 400 });
  }

  const pdf = await resumePdfBuffer(resume);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
