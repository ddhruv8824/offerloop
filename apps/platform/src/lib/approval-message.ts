/**
 * The text sent (e.g. on Signal) when a workflow run stops at "Wait for my approval": what it
 * found, the best few jobs, and a link to approve. Pure, so it's tested without a network.
 */
import type { WorkflowRun } from "./workflow-defs";

const SHOWN = 5;

export function approvalMessage(run: Pick<WorkflowRun, "workflowName" | "jobs">, siteUrl: string): string {
  const jobs = [...run.jobs].sort((a, b) => b.score - a.score);
  const lines = [`Offerloop: "${run.workflowName}" found ${jobs.length} job${jobs.length === 1 ? "" : "s"} and is waiting for your approval.`, ""];
  for (const j of jobs.slice(0, SHOWN)) {
    const learn = j.missing?.length ? ` · new: ${j.missing.slice(0, 3).join(", ")}` : "";
    lines.push(`• ${j.title} — ${j.company} (${j.score}%${j.verdict ? `, ${j.verdict}` : ""})${learn}`);
  }
  if (jobs.length > SHOWN) lines.push(`…and ${jobs.length - SHOWN} more`);
  lines.push("", `Approve: ${siteUrl.replace(/\/+$/, "")}/automations`);
  return lines.join("\n");
}
