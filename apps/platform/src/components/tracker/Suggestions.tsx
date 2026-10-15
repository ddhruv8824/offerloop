"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { acceptSuggestion, dismissSuggestion, STATUS_LABEL, type Suggestion, type TrackerCard } from "@/lib/tracker";
import type { ApplicationStatus } from "@/lib/types";

const KIND_STATUS: Record<string, ApplicationStatus> = {
  applied: "applied",
  in_review: "in_review",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
};

/** Emails the tracker wasn't sure about: unclear wording, or no matching card. The user decides. */
export function Suggestions({ suggestions, cards }: { suggestions: Suggestion[]; cards: TrackerCard[] }) {
  if (!suggestions.length) return null;
  return (
    <Card className="mb-6 border-warning/40">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <HelpCircle className="size-4 text-warning" /> Needs your review
          </span>
        }
        subtitle="Emails that might be updates, but the tracker wasn't sure enough to move a card"
      />
      <ul className="divide-y divide-line">
        {suggestions.map((s) => (
          <SuggestionRow key={s.detection.messageId} suggestion={s} cards={cards} />
        ))}
      </ul>
    </Card>
  );
}

function SuggestionRow({ suggestion, cards }: { suggestion: Suggestion; cards: TrackerCard[] }) {
  const { detection: d } = suggestion;
  const [cardId, setCardId] = useState(suggestion.cardId ?? "");
  const status = KIND_STATUS[d.kind];
  const card = cards.find((c) => c.id === cardId);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{d.subject || "(no subject)"}</p>
          <Badge tone="warning">Looks like: {STATUS_LABEL[status]}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {d.from} · {new Date(d.date).toLocaleDateString()}
        </p>
        <p className="mt-1 text-xs text-text/80">“{d.evidence}”</p>
        <p className="mt-1 text-xs text-muted">
          {suggestion.reason === "no-match" ? "Couldn't tell which job this is about." : "The wording isn't clear enough to be sure."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <select
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          className="max-w-56 rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
          aria-label="Which job is this about?"
        >
          <option value="">Which job?</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.company}
            </option>
          ))}
        </select>
        <Button className="px-3 py-1.5 text-xs" disabled={!card} onClick={() => card && acceptSuggestion(d.messageId, card.id)}>
          Move to {STATUS_LABEL[status]}
        </Button>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => dismissSuggestion(d.messageId)}>
          Not an update
        </Button>
      </div>
    </li>
  );
}
