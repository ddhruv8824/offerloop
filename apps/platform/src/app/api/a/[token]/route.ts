import { NextResponse, type NextRequest } from "next/server";
import { linkJobIds } from "@/lib/server/approval-links";
import { lookupApprovalLink } from "@/lib/server/approval-lookup";
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

  const found = await lookupApprovalLink(token);
  if (!found) return back("gone");
  const { uid, link } = found;
  const run = (await readStore(uid)).runs.find((r) => r.id === link.runId);
  if (!run || run.status !== "waiting_approval") return back("gone");

  try {
    if (link.action === "skip") await cancelRun(uid, run.id);
    else await approveRun(uid, run.id, linkJobIds(link, run));
  } catch {
    return back("gone");
  }
  await updateStore(uid, (d) => {
    d.approvalLinks = d.approvalLinks.filter((l) => l.runId !== run.id);
  });
  return back(link.action === "skip" ? "skipped" : "approved");
}
