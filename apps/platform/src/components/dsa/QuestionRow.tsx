"use client";

import { Bookmark, CheckCircle2, Circle, ExternalLink, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui";
import { leetcodeUrl, markOpened, setStatus, toggleSaved, type ListItem, type QuestionStatus } from "@/lib/dsa";
import { cn } from "@/lib/utils";

const DIFFICULTY_TONE = { Easy: "success", Medium: "warning", Hard: "danger" } as const;

/** One LeetCode question: status toggle, link out, difficulty, topics, how often it's asked, save. */
export function QuestionRow({
  item,
  status,
  saved,
  compact = false,
}: {
  item: ListItem;
  status?: QuestionStatus;
  saved: boolean;
  compact?: boolean;
}) {
  const { question: qn, frequency } = item;
  const solved = status === "solved";

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", solved && "bg-success-wash/40")}>
      <button
        type="button"
        onClick={() => setStatus(qn.slug, solved ? null : "solved")}
        className="shrink-0 rounded-full text-faint hover:text-success"
        aria-label={solved ? `Mark ${qn.title} as not solved` : `Mark ${qn.title} as solved`}
        aria-pressed={solved}
      >
        {solved ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <a
          href={leetcodeUrl(qn.slug)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markOpened(qn.slug)}
          className="group inline-flex items-center gap-1.5 text-sm font-medium hover:text-coral-strong"
        >
          <span className={cn(solved && "text-muted")}>{qn.title}</span>
          <ExternalLink className="size-3.5 shrink-0 text-faint group-hover:text-coral-strong" aria-label="opens LeetCode in a new tab" />
        </a>
        {!compact && (
          <div className="mt-1 flex flex-wrap gap-1">
            {qn.topics.map((t) => (
              <span key={t} className="rounded-sm bg-ink/5 px-1.5 py-0.5 text-[11px] text-muted">
                {t}
              </span>
            ))}
            {status === "revisit" && <Badge tone="info">Revisit</Badge>}
          </div>
        )}
      </div>

      {frequency != null && (
        <div className="hidden w-28 shrink-0 sm:block" title={`Asked often: ${frequency}/100`}>
          <div className="h-1.5 rounded-full bg-line">
            <div className="h-1.5 rounded-full bg-coral" style={{ width: `${frequency}%` }} />
          </div>
          <p className="mt-0.5 text-right font-mono text-[10px] text-muted">{frequency}</p>
        </div>
      )}

      <Badge tone={DIFFICULTY_TONE[qn.difficulty]} className="shrink-0">
        {qn.difficulty}
      </Badge>

      {!compact && (
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setStatus(qn.slug, status === "revisit" ? null : "revisit")}
            className={cn("rounded p-1.5 hover:bg-ink/5", status === "revisit" ? "text-info" : "text-faint hover:text-text")}
            aria-label={`Mark ${qn.title} to revisit`}
            aria-pressed={status === "revisit"}
            title="Revisit later"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleSaved(qn.slug)}
            className={cn("rounded p-1.5 hover:bg-ink/5", saved ? "text-coral-strong" : "text-faint hover:text-text")}
            aria-label={saved ? `Remove ${qn.title} from my list` : `Save ${qn.title} to my list`}
            aria-pressed={saved}
            title="My list"
          >
            <Bookmark className={cn("size-4", saved && "fill-current")} />
          </button>
        </div>
      )}
    </li>
  );
}
