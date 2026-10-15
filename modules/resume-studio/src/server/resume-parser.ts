// Uploaded resume file → id-tagged resume JSON, in one AI call:
//   1. load the file (PDF bytes + column-aware text)   extract.ts
//   2. ask the model for a ResumeExtraction            schemas.ts
//   3. give every job, project and bullet a stable id  structure.ts

import type { Resume } from "../lib/tailor/types";
import { extractText } from "./extract";
import { ask, PROVIDERS, type LlmConfig } from "./models";
import * as prompts from "./prompts";
import { ResumeExtraction } from "./schemas";
import { assignIds } from "./structure";

export async function parseResumeFile(llm: LlmConfig, bytes: Uint8Array, ext: string): Promise<Resume> {
  const document: prompts.ResumeDocument = {
    mime: ext === ".pdf" ? "application/pdf" : "text/plain",
    bytes,
    text: await extractText(bytes, ext),
  };
  if (!document.text.trim() && !PROVIDERS[llm.provider].readsPdf) {
    throw new Error("This PDF has no extractable text (is it scanned?). Try Gemini, Claude or OpenAI.");
  }
  const extraction = await ask(llm, ResumeExtraction, prompts.resumeExtraction(llm.provider, document));
  return assignIds(extraction);
}
