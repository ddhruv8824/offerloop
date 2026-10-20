// The PDF files the agent uploads to your Hirist profile: a job's tailored resume (from
// Offerloop) and your main resume (OFFERLOOP_MAIN_RESUME, else your Resume Studio resume).
// Each is saved under the same file name, since recruiters see the name on Hirist.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OfferloopClient } from "./client.js";

const DIR = fileURLToPath(new URL("../../data/resumes/", import.meta.url));

/** Your own resume file, if you set OFFERLOOP_MAIN_RESUME (the one to put back). */
export function mainResumePath(): string | null {
  const path = process.env.OFFERLOOP_MAIN_RESUME?.trim().replace(/^"|"$/g, "");
  if (!path) return null;
  if (!existsSync(path)) throw new Error(`OFFERLOOP_MAIN_RESUME points to ${path}, which doesn't exist.`);
  return path;
}

/** The file name recruiters see: OFFERLOOP_RESUME_FILENAME, else your main resume's name. */
export function resumeFileName(): string {
  const named = process.env.OFFERLOOP_RESUME_FILENAME?.trim();
  const main = process.env.OFFERLOOP_MAIN_RESUME?.trim().replace(/^"|"$/g, "");
  const name = named || (main ? basename(main) : "") || "Resume.pdf";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

async function save(folder: string, bytes: Uint8Array): Promise<string> {
  const dir = join(DIR, folder);
  await mkdir(dir, { recursive: true });
  const file = join(dir, resumeFileName());
  await writeFile(file, bytes);
  return file;
}

/** The resume tailored to a queued job, saved as a PDF. */
export async function tailoredResumeFile(offerloop: OfferloopClient, itemId: string): Promise<string> {
  return save("tailored", await offerloop.resumePdf({ item: itemId }));
}

/** Your main resume: your own file, or your Resume Studio resume as a PDF. */
export async function mainResumeFile(offerloop: OfferloopClient): Promise<string> {
  return mainResumePath() ?? save("main", await offerloop.resumePdf("main"));
}
