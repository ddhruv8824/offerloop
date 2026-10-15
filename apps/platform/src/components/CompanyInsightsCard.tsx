"use client";

import { CircleAlert, CircleCheck, IndianRupee, Scale } from "lucide-react";
import { suggestAsk } from "@/lib/insights";
import { useProfile } from "@/lib/profile";
import type { Company } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState } from "./ui";

const CONFIDENCE = {
  good: { tone: "success", label: "Good data" },
  fair: { tone: "info", label: "Some data" },
  low: { tone: "warning", label: "Few data points" },
} as const;

/** "Get salary & culture insights": what CTC to ask for and what working there is like. */
export function CompanyInsightsCard({ company }: { company: Company }) {
  const { profile } = useProfile();
  const insights = company.insights;

  if (!insights) {
    return (
      <Card className="mb-6">
        <CardHeader title={<span className="flex items-center gap-2"><Scale className="size-4" /> Salary &amp; culture</span>} />
        <EmptyState icon={<IndianRupee className="size-5" />} title="Not enough salary data yet">
          Interviewed or got an offer here? Sharing the range helps the next person ask for the right number.
        </EmptyState>
      </Card>
    );
  }

  const { culture } = insights;
  return (
    <Card className="mb-6">
      <CardHeader
        title={<span className="flex items-center gap-2"><Scale className="size-4" /> Salary &amp; culture</span>}
        subtitle="What to ask for, and what it's like to work here"
      />
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Pay */}
        <div className="space-y-4">
          {insights.pay.map((band) => {
            const { ask, floor, belowMinimum, confidence } = suggestAsk(band, profile?.minSalaryLpa);
            const span = band.high - band.low || 1;
            const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - band.low) / span) * 100))}%`;
            return (
              <div key={band.role} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {band.role} <span className="font-normal text-muted">· {band.experience}</span>
                  </p>
                  <Badge tone={CONFIDENCE[confidence].tone}>
                    {CONFIDENCE[confidence].label} · {band.dataPoints}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted">Ask for</p>
                <p className="font-display text-2xl font-semibold text-coral-strong">{ask} LPA</p>
                <p className="text-xs text-muted">Settle no lower than {floor} LPA</p>

                {/* Range bar: low — median — high, with the ask marked */}
                <div className="relative mt-4 h-2 rounded-full bg-line" role="img" aria-label={`Market range ${band.low} to ${band.high} LPA, median ${band.median}`}>
                  <span className="absolute inset-y-0 rounded-full bg-success/40" style={{ left: pos(band.median), right: 0 }} />
                  <span className="absolute -top-1 h-4 w-0.5 bg-text" style={{ left: pos(band.median) }} />
                  <span className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-paper bg-coral" style={{ left: pos(ask) }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                  <span>{band.low}</span>
                  <span>median {band.median}</span>
                  <span>{band.high}</span>
                </div>
                {belowMinimum && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-warning">
                    <CircleAlert className="size-3.5" aria-hidden /> Even the top of this range is below your {profile?.minSalaryLpa} LPA minimum.
                  </p>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted">
            Ask in the upper half of the range so you can settle near the median.{" "}
            {profile?.minSalaryLpa ? `Never below your ${profile.minSalaryLpa} LPA minimum.` : "Set a minimum salary in your profile to factor it in."}
          </p>
        </div>

        {/* Culture */}
        <div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-ink/[0.03] p-3">
              <dt className="text-xs text-muted">Work-life</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold">{culture.workLife}/5</dd>
            </div>
            <div className="rounded-md bg-ink/[0.03] p-3">
              <dt className="text-xs text-muted">Work mode</dt>
              <dd className="mt-0.5 text-sm font-semibold">{culture.workMode}</dd>
            </div>
            <div className="col-span-2 rounded-md bg-ink/[0.03] p-3">
              <dt className="text-xs text-muted">Hours</dt>
              <dd className="mt-0.5 text-sm">{culture.hours}</dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2">
            {culture.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Good" /> {h}
              </li>
            ))}
            {culture.watchOuts.map((w) => (
              <li key={w} className="flex items-start gap-2 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Watch out" /> {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
