import { NextResponse } from "next/server";
import { extractText } from "@offerloop/resume-studio/server";
import { skillsInText } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Onboarding: read an uploaded resume (PDF or DOCX) and return the skills it mentions,
 * matched against the skill catalogue (lib/skills.ts). No AI involved, and the file isn't
 * stored — it's read once and dropped.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That file is larger than 10 MB." }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF or DOCX file." }, { status: 400 });
  const ext = /\.(pdf|docx)$/i.exec(file.name)?.[0].toLowerCase();
  if (!ext) return NextResponse.json({ error: "Upload a PDF or DOCX file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is larger than 10 MB." }, { status: 413 });

  let text: string;
  try {
    text = await extractText(new Uint8Array(await file.arrayBuffer()), ext);
  } catch {
    return NextResponse.json({ error: "Couldn't read that file. Is it a real PDF or DOCX?" }, { status: 422 });
  }
  if (!text.trim()) {
    return NextResponse.json(
      { error: "This file has no readable text (is it a scanned image?). Add your skills by hand." },
      { status: 422 },
    );
  }
  return NextResponse.json({ skills: skillsInText(text) });
}
