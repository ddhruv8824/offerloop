"use client";

import Link from "next/link";
import { ExternalLink, ListChecks, Mail, Trash2, Undo2, UserRound, Workflow } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Badge, Button } from "@/components/ui";
import { gmailUrl } from "@/lib/gmail-link";
import { moveCard, removeCard, setNotes, STATUS_LABEL, undoEvent, type TrackerCard, type TrackerEvent } from "@/lib/tracker";
import { STATUS_ORDER, type ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_ICON = { you: UserRound, email: Mail, workflow: Workflow, sample: UserRound } as const;

/** Drawer with everything about one application: status, timeline (with undo), notes. */
export function CardDetail({ card, onClose }: { card: TrackerCard | null; onClose: () => void }) {
  return (
    <Dialog open={card !== null} onClose={onClose} side title={card ? <CardTitle card={card} /> : null}>
      {card && <Body card={card} onClose={onClose} />}
    </Dialog>
  );
}

function CardTitle({ card }: { card: TrackerCard }) {
  return (
    <div>
      <p className="truncate">{card.title}</p>
      <p className="truncate text-sm font-normal text-muted">
        {card.company}
        {card.source ? ` · via ${card.source}` : ""}
      </p>
    </div>
  );
}

function Body({ card, onClose }: { card: TrackerCard; onClose: () => void }) {
  const events = [...card.events].reverse();
  const lastUndoable = events.find((e) => e.source === "email" && e.from && e.to && !e.undone);

  return (
    <div className="space-y-6 p-5">
      <label className="block">
        <span className="text-xs font-semibold text-muted">Status</span>
        <select
          value={card.status}
          onChange={(e) => moveCard(card.id, e.target.value as ApplicationStatus)}
          className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-1.5">
        {card.matchScore != null && <Badge tone={card.matchScore >= 75 ? "success" : "neutral"}>{card.matchScore}% match</Badge>}
        {card.resumeVersion && <Badge>Resume {card.resumeVersion}</Badge>}
        {card.practiceScore != null && <Badge tone="coral">Mock {card.practiceScore}/10</Badge>}
        {card.sample && <Badge tone="info">Sample card</Badge>}
        <Link
          href={card.companySlug ? `/dsa?company=${card.companySlug}` : "/dsa"}
          className="inline-flex items-center gap-1 text-xs font-semibold text-coral-strong hover:underline"
        >
          <ListChecks className="size-3" /> DSA prep for {card.company}
        </Link>
        {card.url && (
          <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-coral-strong hover:underline">
            Job posting <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold text-muted">Timeline</p>
        <ol className="relative space-y-4 border-l border-line pl-5">
          {events.map((e) => (
            <TimelineItem key={e.id} event={e} canUndo={e.id === lastUndoable?.id} onUndo={() => undoEvent(card.id, e.id)} />
          ))}
        </ol>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-muted">Notes</span>
        <textarea
          defaultValue={card.notes ?? ""}
          onBlur={(e) => setNotes(card.id, e.target.value)}
          rows={4}
          placeholder="Recruiter name, interview date, what they asked…"
          className="mt-1 w-full resize-y rounded-md border border-line bg-paper p-3 text-sm outline-none focus:border-ink"
        />
      </label>

      <div className="border-t border-line pt-4">
        <Button
          variant="ghost"
          className="text-danger hover:bg-danger-wash hover:text-danger"
          onClick={() => {
            if (confirm(`Remove "${card.title}" from your tracker?`)) {
              removeCard(card.id);
              onClose();
            }
          }}
        >
          <Trash2 className="size-4" /> Remove from tracker
        </Button>
      </div>
    </div>
  );
}

function TimelineItem({ event, canUndo, onUndo }: { event: TrackerEvent; canUndo: boolean; onUndo: () => void }) {
  const Icon = SOURCE_ICON[event.source];
  const link = event.source === "email" ? gmailUrl(event.messageId) : null;
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute top-0.5 -left-[29px] grid size-4.5 place-items-center rounded-full border-2 border-paper",
          event.source === "email" ? "bg-info text-paper" : "bg-faint text-paper",
        )}
        aria-hidden
      >
        <Icon className="size-2.5" />
      </span>
      <p className={cn("text-sm", event.undone && "text-muted line-through")}>{event.text}</p>
      {event.evidence && <p className="mt-1 rounded-sm bg-ink/[0.03] px-2 py-1 text-xs text-muted">“{event.evidence}”</p>}
      <div className="mt-1 flex items-center gap-3">
        <span className="text-[11px] text-faint">
          {new Date(event.at).toLocaleString()} · {event.source === "email" ? "from your inbox" : event.source === "workflow" ? "automation" : event.source === "sample" ? "sample" : "you"}
        </span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral-strong hover:underline">
            <Mail className="size-3" aria-hidden /> Open email
          </a>
        )}
        {canUndo && (
          <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral-strong hover:underline">
            <Undo2 className="size-3" /> Undo
          </button>
        )}
      </div>
    </li>
  );
}
