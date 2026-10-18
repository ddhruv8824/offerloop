/**
 * The text sent (e.g. on Signal) when a workflow run stops at "Wait for my approval": what it
 * found, the best jobs (numbered), and one-tap links to approve all, approve one, or skip.
 * Pure, so it's tested without a network.
 */
import type { MadeLinks } from "./server/approval-links";
import type { WorkflowRun } from "./workflow-defs";

const SHOWN = 5;
const SINGLE_LINKS = 3;

export function approvalMessage(run: Pick<WorkflowRun, "workflowName" | "jobs">, siteUrl: string, links?: MadeLinks): string {
  const site = siteUrl.replace(/\/+$/, "");
  const link = (token: string) => `${site}/a/${token}`;
  // Best first — the same order the "Approve #N" links were made in.
  const jobs = [...run.jobs].sort((a, b) => b.score - a.score);
  const lines = [`Offerloop: ${run.workflowName} found ${jobs.length} job${jobs.length === 1 ? "" : "s"}, waiting for your approval.`, ""];
  jobs.slice(0, SHOWN).forEach((j, i) => {
    const learn = j.missing?.length ? ` | new: ${j.missing.slice(0, 3).join(", ")}` : "";
    lines.push(`${i + 1}. ${j.title} - ${j.company} (${j.score}%${j.verdict ? `, ${j.verdict}` : ""})${learn}`);
  });
  if (jobs.length > SHOWN) lines.push(`...and ${jobs.length - SHOWN} more`);
  lines.push("");
  if (links) {
    // Plain characters and few links: free relays are pickier about long, link-heavy messages.
    lines.push(`APPROVE ALL ${jobs.length}: ${link(links.all)}`);
    if (links.single.length > 1) links.single.slice(0, SINGLE_LINKS).forEach((s, i) => lines.push(`Approve #${i + 1} only: ${link(s.token)}`));
    lines.push(`Skip this run: ${link(links.skip)}`);
    lines.push(`Pick on the site: ${site}/automations`);
  } else {
    lines.push(`Approve: ${site}/automations`);
  }
  return lines.join("\n");
}

/** The fallback when the full message won't go through: one line and one approve link. */
export function shortApprovalMessage(run: Pick<WorkflowRun, "workflowName" | "jobs">, siteUrl: string, links?: MadeLinks): string {
  const site = siteUrl.replace(/\/+$/, "");
  const n = run.jobs.length;
  const head = `Offerloop: ${run.workflowName} found ${n} job${n === 1 ? "" : "s"}, waiting for your approval.`;
  return links ? `${head}\nApprove all: ${site}/a/${links.all}\nPick on the site: ${site}/automations` : `${head}\n${site}/automations`;
}
