"use client";

import { useEffect, useState } from "react";
import { clearOpened, QUESTION_BY_SLUG, setStatus, useDsa } from "@/lib/dsa";
import { Button } from "@/components/ui";

const RECENT_MS = 6 * 60 * 60 * 1000;

/**
 * When the user comes back from a LeetCode tab, ask whether they solved the
 * question they opened — so their list stays up to date without extra clicks.
 */
export function BackFromLeetCode() {
  const dsa = useDsa();
  const [returned, setReturned] = useState(false);

  useEffect(() => {
    const onBack = () => document.visibilityState === "visible" && setReturned(true);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  const opened = dsa?.lastOpened;
  if (!returned || !opened || Date.now() - opened.at > RECENT_MS) return null;
  const qn = QUESTION_BY_SLUG[opened.slug];
  if (!qn || dsa.status[opened.slug] === "solved") return null;

  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-lg bg-ink px-4 py-3 text-paper sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">
        Back from LeetCode — did you solve <span className="font-semibold">{qn.title}</span>?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button className="px-3 py-1.5 text-xs" onClick={() => setStatus(qn.slug, "solved")}>
          Solved it
        </Button>
        <Button variant="ghost" className="px-3 py-1.5 text-xs text-paper/80 hover:bg-paper/10 hover:text-paper" onClick={() => setStatus(qn.slug, "revisit")}>
          Revisit later
        </Button>
        <Button
          variant="ghost"
          className="px-3 py-1.5 text-xs text-paper/60 hover:bg-paper/10 hover:text-paper"
          onClick={() => {
            clearOpened();
            setReturned(false);
          }}
        >
          Not yet
        </Button>
      </div>
    </div>
  );
}
