import { NextResponse, type NextRequest } from "next/server";
import { nextRunAt, schedulerStatus } from "@/lib/server/automations/scheduler";
import { parseWorkflow } from "@/lib/server/automations/validate";
import { parseProfile } from "@/lib/server/jobs/request";
import { readStore, updateStore } from "@/lib/server/store";
import { normaliseWorkflow } from "@/lib/workflow-defs";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Saved workflows (with when each runs next) and recent runs. */
export const GET = memberRoute(async (_req, _ctx, user) => {
  const data = await readStore(user.id);
  return NextResponse.json({
    workflows: data.workflows.map((wf) => ({ ...normaliseWorkflow(wf), nextRunAt: nextRunAt(wf) })),
    runs: data.runs.slice(0, 30),
    hasProfile: Boolean(data.profile),
    // The latest Hirist applications and whether the job agent is connected (never its key).
    applyQueue: data.applyQueue.slice(0, 60),
    agent: data.agent
      ? { connected: true, createdAt: data.agent.createdAt, lastSeenAt: data.agent.lastSeenAt ?? null, problem: data.agent.problem ?? null }
      : { connected: false },
    scheduler: schedulerStatus(),
  });
});

/**
 * Create or update a workflow. The browser also sends its timezone (so "09:00" means the
 * user's 09:00) and the current career profile (what scheduled job searches will use).
 */
export const POST = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { workflow?: unknown; timezone?: unknown; profile?: unknown };
  const profile = body.profile === undefined ? undefined : parseProfile(body.profile);
  const saved = await updateStore(user.id, (data) => {
    if (profile) data.profile = profile;
    if (body.workflow === undefined) return null;
    const id = (body.workflow as { id?: unknown })?.id;
    const index = data.workflows.findIndex((w) => w.id === id);
    const workflow = parseWorkflow(body.workflow, body.timezone, index >= 0 ? data.workflows[index] : undefined);
    if (!workflow) return undefined;
    if (index >= 0) data.workflows[index] = workflow;
    else data.workflows.unshift(workflow);
    if (data.workflows.length > 50) data.workflows.length = 50;
    return workflow;
  });
  if (saved === undefined) return NextResponse.json({ error: "That workflow couldn't be saved." }, { status: 400 });
  return NextResponse.json({ workflow: saved ? { ...saved, nextRunAt: nextRunAt(saved) } : null });
});

export const DELETE = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const id = req.nextUrl.searchParams.get("id");
  await updateStore(user.id, (data) => {
    data.workflows = data.workflows.filter((w) => w.id !== id);
    if (id) delete data.seenJobs[id];
  });
  return NextResponse.json({ ok: true });
});
