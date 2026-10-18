import { NextResponse } from "next/server";
import { memberRoute } from "@/lib/server/auth/session";
import { platformStorage } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** The browser-side documents kept per account: what's synced between your devices. */
const DOCS = new Set(["profile", "tracker", "dsa"]);
const MAX_BYTES = 1_000_000;

type Ctx = { params: Promise<{ name: string }> };
interface Saved {
  value: unknown;
  updatedAt: string;
}

const key = (uid: string, name: string) => `users/${uid}/docs/${name}`;

/** Your saved copy: { value, updatedAt } (value null when there's none yet). */
export const GET = memberRoute<Request, Ctx>(async (_req, { params }, user) => {
  const { name } = await params;
  if (!DOCS.has(name)) return NextResponse.json({ error: "Unknown document." }, { status: 404 });
  const saved = await platformStorage().get<Saved>(key(user.id, name));
  return NextResponse.json(saved ?? { value: null, updatedAt: null });
});

/** Save it: { value, updatedAt }. An older copy than the one stored is ignored (409). */
export const PUT = memberRoute<Request, Ctx>(async (req, { params }, user) => {
  const { name } = await params;
  if (!DOCS.has(name)) return NextResponse.json({ error: "Unknown document." }, { status: 404 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let body: Partial<Saved>;
  try {
    body = JSON.parse(text) as Partial<Saved>;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const updatedAt = typeof body.updatedAt === "string" && !Number.isNaN(Date.parse(body.updatedAt)) ? body.updatedAt : new Date().toISOString();
  const current = await platformStorage().get<Saved>(key(user.id, name));
  if (current && current.updatedAt > updatedAt) return NextResponse.json({ error: "A newer copy is saved.", ...current }, { status: 409 });
  await platformStorage().set(key(user.id, name), { value: body.value ?? null, updatedAt });
  return NextResponse.json({ ok: true, updatedAt });
});
