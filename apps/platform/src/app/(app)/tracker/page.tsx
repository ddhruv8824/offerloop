"use client";

import { useState } from "react";
import { FileText, Loader2, Mail, Mic, Plus } from "lucide-react";
import { AddJobDialog } from "@/components/tracker/AddJobDialog";
import { CardDetail } from "@/components/tracker/CardDetail";
import { InboxPanel } from "@/components/tracker/InboxPanel";
import { Suggestions } from "@/components/tracker/Suggestions";
import { Badge, Button, Card, CompanyAvatar, PageHeader } from "@/components/ui";
import { clearSampleCards, STATUS_LABEL, useTracker, type TrackerCard } from "@/lib/tracker";
import { useAutomations } from "@/lib/workflows";
import { STATUS_ORDER, type ApplicationStatus } from "@/lib/types";
import { cn, daysAgo } from "@/lib/utils";

const DOT: Record<ApplicationStatus, string> = {
  saved: "bg-faint",
  applied: "bg-info",
  in_review: "bg-info",
  assessment: "bg-warning",
  interview: "bg-coral",
  offer: "bg-success",
  rejected: "bg-muted",
};

const ageInDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Tracker() {
  const state = useTracker();
  // Keeps checking the server, so jobs the Hirist agent applied to land here while it's open.
  useAutomations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!state) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading tracker" />
      </div>
    );
  }

  const { cards, suggestions, processedEmails, lastScanAt } = state;
  const hasSamples = cards.some((c) => c.sample);
  const open = cards.find((c) => c.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="Tracker"
        description="One card per job. Connect your inbox and cards move on their own; anything automatic shows where it came from and can be undone."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add job
          </Button>
        }
      />

      <InboxPanel cards={cards} processed={processedEmails} lastScanAt={lastScanAt} />
      <Suggestions suggestions={suggestions} cards={cards} />

      {hasSamples && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-info-wash px-4 py-2 text-sm text-info">
          <span>Some cards are samples, so you can see how the board works.</span>
          <button type="button" onClick={clearSampleCards} className="font-semibold hover:underline">
            Remove sample cards
          </button>
        </div>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1260px] grid-cols-7 gap-3">
          {STATUS_ORDER.map((status) => {
            const column = cards.filter((c) => c.status === status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return (
              <section key={status} aria-label={STATUS_LABEL[status]} className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
                  <span className={cn("size-2 rounded-full", DOT[status])} aria-hidden />
                  {STATUS_LABEL[status]}
                  <span className="font-mono text-xs text-muted">{column.length}</span>
                </h2>
                <div className="flex min-h-32 flex-col gap-2.5 rounded-lg bg-ink/[0.03] p-2">
                  {column.map((card) => (
                    <TrackerCardView key={card.id} card={card} onOpen={() => setOpenId(card.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <CardDetail card={open} onClose={() => setOpenId(null)} />
      <AddJobDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function TrackerCardView({ card, onOpen }: { card: TrackerCard; onOpen: () => void }) {
  const last = card.events[card.events.length - 1];
  const fromEmail = last?.source === "email" && !last.undone;
  const quiet = card.status === "applied" && ageInDays(card.updatedAt) >= 14;

  return (
    <button type="button" onClick={onOpen} className="text-left" aria-label={`${card.title} at ${card.company} — open details`}>
      <Card className={cn("p-3 transition-colors hover:border-faint", fromEmail && "border-info/50")}>
        <div className="flex items-start gap-2.5">
          <CompanyAvatar name={card.company} size={26} />
          <div className="min-w-0">
            <p className="text-sm leading-snug font-semibold">{card.title}</p>
            <p className="truncate text-xs text-muted">{card.company}</p>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {card.matchScore != null && <Badge tone={card.matchScore >= 75 ? "success" : "neutral"}>{card.matchScore}%</Badge>}
          {card.resumeVersion && (
            <Badge>
              <FileText className="size-3" aria-hidden /> {card.resumeVersion}
            </Badge>
          )}
          {card.practiceScore != null && (
            <Badge tone="coral">
              <Mic className="size-3" aria-hidden /> {card.practiceScore}
            </Badge>
          )}
        </div>
        {fromEmail ? (
          <p className="mt-2 flex items-start gap-1 text-[11px] text-info">
            <Mail className="mt-px size-3 shrink-0" aria-hidden /> Updated from your inbox
          </p>
        ) : quiet ? (
          <p className="mt-2 text-[11px] text-warning">No reply in {ageInDays(card.updatedAt)} days — follow up?</p>
        ) : (
          card.nextStep && <p className="mt-2 text-[11px] text-text">{card.nextStep}</p>
        )}
        <p className="mt-2 border-t border-line pt-1.5 text-[11px] text-muted">Updated {daysAgo(ageInDays(card.updatedAt))}</p>
      </Card>
    </button>
  );
}
