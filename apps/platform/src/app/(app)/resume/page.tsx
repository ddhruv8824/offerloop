"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { withBase } from "@/lib/base-path";

const loading = () => (
  <div className="grid h-full place-items-center bg-ink">
    <Loader2 className="size-5 animate-spin text-paper/60" aria-label="Loading Resume Studio" />
  </div>
);

// Redline runs in the browser only (React-PDF), so no server rendering.
const ResumeStudio = dynamic(() => import("@offerloop/resume-studio"), { ssr: false, loading });

// Same origin: /api/redline/* runs Resume Studio's engine in this app (see app/api/redline).
const REDLINE_API_URL = withBase("/api/redline");

// Before accounts, each browser had its own workspace id (kept here by Resume Studio). The
// first time Resume Studio opens after signing in, that workspace moves into the account.
const OLD_WORKSPACE_KEY = "redline_workspace";
const IMPORTED_KEY = "offerloop.workspace-imported.v1";

export default function ResumeStudioPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let old: string | null = null;
    try {
      old = localStorage.getItem(IMPORTED_KEY) ? null : localStorage.getItem(OLD_WORKSPACE_KEY);
    } catch {
      // storage blocked: nothing to bring over
    }
    if (!old) {
      setReady(true);
      return;
    }
    fetch(withBase("/api/me/import-workspace"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: old }) })
      .then((res) => {
        if (res.ok) localStorage.setItem(IMPORTED_KEY, new Date().toISOString());
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  return ready ? <ResumeStudio apiUrl={REDLINE_API_URL} embedded /> : loading();
}
