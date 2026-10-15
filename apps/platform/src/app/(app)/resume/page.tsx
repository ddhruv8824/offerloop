"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Redline runs in the browser only (localStorage workspace, React-PDF), so no server rendering.
const ResumeStudio = dynamic(() => import("@offerloop/resume-studio"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-ink">
      <Loader2 className="size-5 animate-spin text-paper/60" aria-label="Loading Resume Studio" />
    </div>
  ),
});

// Same origin: /api/redline/* runs Resume Studio's engine in this app (see app/api/redline).
const REDLINE_API_URL = "/api/redline";

export default function ResumeStudioPage() {
  return <ResumeStudio apiUrl={REDLINE_API_URL} embedded />;
}
