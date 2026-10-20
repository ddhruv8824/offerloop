// For pages outside Resume Studio that show a tailored resume (Offerloop's automation review):
// the same paper preview, which parts changed, and the same PDF.
import type { Resume } from "./lib/tailor/types";

export { ResumePaper } from "./components/ResumePaper";
export { highlightIdsFor } from "./lib/tailor/patch";
export type { Resume, TailorChange, TailorReviewSummary, Gap, JdAnalysis } from "./lib/tailor/types";

/** Download the resume as the same PDF Resume Studio makes (React-PDF loads only now). */
export async function downloadResumePdf(resume: Resume, company?: string): Promise<void> {
  const { renderResumePdf } = await import("./lib/renderPdf");
  const url = URL.createObjectURL(await renderResumePdf(resume));
  const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(resume.contact.name || "resume")}${company ? `_${slug(company)}` : ""}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
