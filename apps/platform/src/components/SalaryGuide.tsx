"use client";

import Link from "next/link";
import { AlertTriangle, IndianRupee, Loader2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { useSalaryMarket } from "@/lib/job-finder";
import { recommendAsk, type Confidence } from "@/lib/salary";
import type { CareerProfile } from "@/lib/types";

const CONFIDENCE: Record<Confidence, { tone: "success" | "info" | "warning"; label: string }> = {
  good: { tone: "success", label: "Good data" },
  fair: { tone: "info", label: "Some data" },
  low: { tone: "warning", label: "Thin data" },
};

/**
 * "What CTC should I ask for?" for the profile's target role: the range similar roles
 * publish, what that means at this person's experience, and how their own numbers move it.
 * Always shows its reasoning and how much data is behind it.
 */
export function SalaryGuide({ profile }: { profile: CareerProfile }) {
  const state = useSalaryMarket(profile);

  if (state.status === "error") {
    return (
      <Card className="mb-4 p-4 text-sm text-muted" role="status">
        Couldn&apos;t build the salary guide right now. Job results below aren&apos;t affected.
      </Card>
    );
  }
  if (state.status !== "ready") {
    return (
      <Card className="mb-4 flex items-center gap-3 p-4 text-sm text-muted">
        <Loader2 className="size-4 shrink-0 animate-spin text-coral-strong" aria-hidden />
        <span>
          <span className="font-semibold text-text">Working out what to ask for…</span> Reading what similar roles publish as pay. About 20 seconds the first time.
        </span>
      </Card>
    );
  }

  const { range, totalObservations } = state.market;
  const advice = recommendAsk({ market: range, currentCtcLpa: profile.currentCtcLpa, minSalaryLpa: profile.minSalaryLpa });

  if (!advice) {
    return (
      <Card className="mb-4 flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center">
        <IndianRupee className="size-4 shrink-0 text-muted" aria-hidden />
        <p className="flex-1 text-muted">
          <span className="font-semibold text-text">Not enough published pay yet to suggest what to ask for.</span> Few {profile.targetRole} postings state a salary
          {totalObservations ? ` (${totalObservations} found so far, across all roles)` : ""}. It fills in as more are seen.
        </p>
        <Link href="/onboarding" className="shrink-0 text-sm font-semibold text-coral-strong hover:underline">
          Add your current CTC
        </Link>
      </Card>
    );
  }

  const c = CONFIDENCE[advice.confidence];
  return (
    <Card className="mb-4">
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[auto_1fr] md:gap-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            <IndianRupee className="size-3.5" aria-hidden /> What to ask for
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-coral-strong">
            {advice.ask} <span className="text-lg">LPA</span>
          </p>
          <p className="text-xs text-muted">Don&apos;t settle below {advice.floor} LPA</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={c.tone}>
              {c.label}
              {range ? ` · ${range.postings} postings` : ""}
            </Badge>
          </div>
        </div>

        <div className="min-w-0">
          <ul className="space-y-1.5 text-sm">
            {advice.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {advice.cautions.map((caution) => (
            <p key={caution} className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> {caution}
            </p>
          ))}
          <p className="mt-3 text-xs text-muted">
            A starting point for {profile.targetRole} roles in general, from postings that publish pay — not a promise. A job that states its own salary gets its own
            figure below.{" "}
            {!profile.currentCtcLpa && (
              <Link href="/onboarding" className="font-semibold text-coral-strong hover:underline">
                Add your current CTC to sharpen it.
              </Link>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
