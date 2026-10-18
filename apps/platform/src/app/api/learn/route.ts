import { NextResponse, type NextRequest } from "next/server";
import { learnKey, sortForLearning, type LearnStatus } from "@/lib/learn";
import { deleteStudyNotes, readStore, updateStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const STATUSES: LearnStatus[] = ["new", "learning", "known"];

/** Your Learn list: tools the jobs you approved ask for, what to study first. */
export async function GET() {
  const { learning } = await readStore();
  return NextResponse.json({ items: sortForLearning(learning) });
}

/** Add a tool by hand: { skill }. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { skill?: unknown };
  const skill = typeof body.skill === "string" ? body.skill.trim().slice(0, 60) : "";
  if (skill.length < 2) return NextResponse.json({ error: "Name the tool, e.g. CrewAI." }, { status: 400 });
  await updateStore((data) => {
    if (!data.learning.some((i) => i.key === learnKey(skill))) {
      const now = new Date().toISOString();
      data.learning.push({ key: learnKey(skill), skill, status: "new", jobs: [], firstSeenAt: now, updatedAt: now });
    }
  });
  return NextResponse.json({ ok: true, key: learnKey(skill) });
}

/** Mark one: { key, status: "new" | "learning" | "known" }. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; status?: unknown };
  if (typeof body.key !== "string" || !STATUSES.includes(body.status as LearnStatus)) {
    return NextResponse.json({ error: "Send { key, status }." }, { status: 400 });
  }
  const found = await updateStore((data) => {
    const item = data.learning.find((i) => i.key === body.key);
    if (!item) return false;
    item.status = body.status as LearnStatus;
    item.updatedAt = new Date().toISOString();
    return true;
  });
  return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not on your list." }, { status: 404 });
}

/** Remove one (and its notes): ?key=… */
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  await updateStore((data) => {
    data.learning = data.learning.filter((i) => i.key !== key);
  });
  if (key) await deleteStudyNotes(learnKey(key)).catch(() => {});
  return NextResponse.json({ ok: true });
}

