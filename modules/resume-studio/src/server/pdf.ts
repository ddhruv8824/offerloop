// The same resume PDF as Resume Studio's download button, made on the server (for the
// Hirist agent, which uploads a job's tailored resume before applying).
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { ResumeDocument } from "../components/ResumePdfTemplate";
import type { Resume } from "../lib/tailor/types";

export async function resumePdfBuffer(resume: Resume): Promise<Buffer> {
  const doc = createElement(ResumeDocument, { resume }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(doc);
}
