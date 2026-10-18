import { NextResponse, type NextRequest } from "next/server";
import { findApprovalLink, linkJobIds } from "@/lib/server/approval-links";
import { approveRun, cancelRun } from "@/lib/server/automations/engine";
import { publicUrl } from "@/lib/server/public-url";
import { readStore, updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * The confirm page's button (POST only — a link preview's GET never acts). Approves or skips
 * the run, then retires every link for that run, so each works once.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (state: string) => NextResponse.redirect(publicUrl(req, `/a/${encodeURIComponent(token)}?done=${state}`), 303);

  const data = await readStore();
  const link = findApprovalLink(data.approvalLinks, token);
  const run = link && data.runs.find((r) => r.id === link.runId);
  if (!link || !run || run.status !== "waiting_approval") return back("gone");

  try {
    if (link.action === "skip") await cancelRun(run.id);
    else await approveRun(run.id, linkJobIds(link, run));
  } catch {
    return back("gone");
  }
  await updateStore((d) => {
    d.approvalLinks = d.approvalLinks.filter((l) => l.runId !== run.id);
  });
  return back(link.action === "skip" ? "skipped" : "approved");
}
