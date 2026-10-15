"use client";

import { useState } from "react";
import { Workspace } from "./components/Workspace";
import { setApiUrl } from "./lib/api";
import { resolveWorkspace } from "./lib/workspace";

export interface ResumeStudioProps {
  /** Where the Redline API runs, e.g. http://127.0.0.1:8100. */
  apiUrl: string;
  /** Fill the parent element instead of the whole screen. */
  embedded?: boolean;
}

/**
 * Redline as a drop-in component: upload a resume, tailor it to a job
 * description, review every edit, download the PDF. Browser-only — render it
 * client-side (e.g. Next.js `dynamic(..., { ssr: false })`).
 */
export function ResumeStudio({ apiUrl, embedded = false }: ResumeStudioProps) {
  setApiUrl(apiUrl);
  // One private workspace per browser, created on first visit (see lib/workspace).
  const [workspace] = useState(resolveWorkspace);
  return <Workspace workspace={workspace} embedded={embedded} />;
}

export default ResumeStudio;
