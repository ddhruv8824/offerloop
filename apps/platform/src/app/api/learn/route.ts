import { NextResponse, type NextRequest } from "next/server";
import { learnKey, sortForLearning, type LearnStatus } from "@/lib/learn";
import { deleteStudyNotes, readStore, updateStore } from "@/lib/server/store";

import { memberRoute } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

const STATUSES: LearnStatus[] = ["new", "learning", "known"];

/** Your Learn list: tools the jobs you approved ask for, what to study first. */
export const GET = memberRoute(async (_req, _ctx, user) => {
  const { learning } = await readStore(user.id);
  return NextResponse.json({ items: sortForLearning(learning) });
});

/** Add a tool by hand: { skill }. */
export const POST = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { skill?: unknown };
  const skill = typeof body.skill === "string" ? body.skill.trim().slice(0, 60) : "";
  if (skill.length < 2) return NextResponse.json({ error: "Name the tool, e.g. CrewAI." }, { status: 400 });
  await updateStore(user.id, (data) => {
    if (!data.learning.some((i) => i.key === learnKey(skill))) {
      const now = new Date().toISOString();
      data.learning.push({ key: learnKey(skill), skill, status: "new", jobs: [], firstSeenAt: now, updatedAt: now });
    }
  });
  return NextResponse.json({ ok: true, key: learnKey(skill) });
});

/** Mark one: { key, status: "new" | "learning" | "known" }. */
export const PATCH = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; status?: unknown };
  if (typeof body.key !== "string" || !STATUSES.includes(body.status as LearnStatus)) {
    return NextResponse.json({ error: "Send { key, status }." }, { status: 400 });
  }
  const found = await updateStore(user.id, (data) => {
    const item = data.learning.find((i) => i.key === body.key);
    if (!item) return false;
    item.status = body.status as LearnStatus;
    item.updatedAt = new Date().toISOString();
    return true;
  });
  return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not on your list." }, { status: 404 });
});

/** Remove one (and its notes): ?key=… */
export const DELETE = memberRoute<NextRequest>(async (req, _ctx, user) => {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  await updateStore(user.id, (data) => {
    data.learning = data.learning.filter((i) => i.key !== key);
  });
  if (key) await deleteStudyNotes(user.id, learnKey(key)).catch(() => {});
  return NextResponse.json({ ok: true });
});

