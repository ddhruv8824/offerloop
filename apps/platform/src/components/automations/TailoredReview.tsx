"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { downloadResumePdf, highlightIdsFor, ResumePaper, type Resume, type TailorChange, type TailorReviewSummary } from "@offerloop/resume-studio/review";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SkillChip } from "@/components/ui";
import type { TailoredResume } from "@/lib/workflow-defs";
import { cn } from "@/lib/utils";

export interface ReviewItem extends TailoredResume {
  jdText: string | null;
  resume: Resume | null;
  edits: TailorChange[];
  review: TailorReviewSummary | null;
  /** Skills the job wants that your profile doesn't show. */
  gaps: string[];
  mustHave: string[];
  /** Tailored, but the saved version is gone (deleted in Resume Studio). */
  missingVersion: boolean;
}

const OP_LABEL: Record<string, string> = {
  rewrite_summary: "Summary",
  rewrite_bullet: "Reworded a bullet",
  add_bullet: "Added a bullet",
  remove_bullet: "Removed a bullet",
  reorder_bullets: "Reordered bullets",
  update_skills: "Skills",
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Each tailored resume next to the job description it was tailored to, with what changed and why. */
export function TailoredReview({ runName, startedAt, items }: { runName: string; startedAt: string; items: ReviewItem[] }) {
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((i) => i.status === "done")));
  const item = items[active];

  return (
    <div>
      <Link href="/automations" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Automations
      </Link>
      <PageHeader
        title="Tailored resumes"
        description={`${runName} · ${when(startedAt)}. Each resume was tailored to its job's description. Read them side by side, then download the ones you'll use or fine-tune them in Resume Studio.`}
      />

      {!items.length ? (
        <Card>
          <EmptyState icon={<FileText className="size-5" />} title="No tailored resumes in this run">
            Add “Tailor my resume” after “Wait for my approval” in the workflow, save your AI key on the Automations page, and run it again.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* One tab per job */}
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Jobs">
            {items.map((it, i) => (
              <button
                key={it.jobId}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "flex w-56 shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "border-coral bg-coral-wash/60" : "border-line bg-paper hover:border-faint",
                )}
              >
                <span className="line-clamp-1 font-semibold">{it.title}</span>
                <span className="line-clamp-1 text-xs text-muted">{it.company}</span>
                {it.status === "done" && it.atsBefore !== undefined && it.atsAfter !== undefined ? (
                  <span className="font-mono text-xs">
                    ATS {it.atsBefore} <ArrowRight className="inline size-3" aria-hidden /> <span className="font-semibold text-success">{it.atsAfter}</span>
                  </span>
                ) : (
                  <span className="text-xs text-danger">{it.status === "failed" ? "Couldn't tailor" : "Missing"}</span>
                )}
              </button>
            ))}
          </div>

          {item && <JobReview key={item.jobId} item={item} />}
        </>
      )}
    </div>
  );
}

function JobReview({ item }: { item: ReviewItem }) {
  const [highlight, setHighlight] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useMemo(() => new Set(item.edits.flatMap((c) => highlightIdsFor(c))), [item.edits]);
  const none = useMemo(() => new Set<string>(), []);

  if (item.status === "failed" || !item.resume) {
    return (
      <Card className="p-5">
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="font-semibold">This one couldn&apos;t be tailored.</span>{" "}
            {item.missingVersion ? "Its saved version was deleted in Resume Studio." : item.message}
          </span>
        </p>
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-coral-strong hover:underline">
          Open the posting <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </Card>
    );
  }

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadResumePdf(item.resume!, item.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {/* The job */}
        <Card className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Job description</p>
              <h2 className="mt-1 text-base font-semibold [overflow-wrap:anywhere]">
                {item.title} <span className="font-normal text-muted">· {item.company}</span>
              </h2>
            </div>
            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-coral-strong hover:underline">
              Open posting <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          {item.mustHave.length > 0 && (
            <div className="border-b border-line px-5 py-3">
              <p className="mb-2 text-xs font-semibold text-muted">Must-have skills the AI found</p>
              <div className="flex flex-wrap gap-1.5">
                {item.mustHave.map((s) => (
                  <SkillChip key={s} skill={s} state={item.gaps.some((g) => g.toLowerCase() === s.toLowerCase()) ? "missing" : "have"} />
                ))}
              </div>
            </div>
          )}
          <div className="max-h-[900px] min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{item.jdText}</div>
        </Card>

        {/* The resume */}
        <Card className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Tailored resume</p>
              <p className="mt-1 font-mono text-sm">
                ATS match {item.atsBefore} <ArrowRight className="inline size-3.5" aria-hidden /> <span className="font-semibold text-success">{item.atsAfter}</span>
                <span className="text-muted"> · {item.edits.length} edits</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-[var(--color-coral)]" /> Highlight edits
              </label>
              <ButtonLink href={`/resume?version=${encodeURIComponent(item.versionId ?? "")}`} variant="ghost" className="px-3 py-1.5 text-xs">
                Edit in Resume Studio
              </ButtonLink>
              <button
                type="button"
                onClick={download}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-strong disabled:opacity-60"
              >
                {downloading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />} PDF
              </button>
            </div>
          </div>
          {error && <p className="px-5 pt-3 text-sm text-danger">{error}</p>}
          {item.message && <p className="px-5 pt-3 text-xs text-warning">{item.message}</p>}
          <div className="max-h-[900px] min-h-0 flex-1 overflow-y-auto bg-am-ink px-3 py-6 sm:px-6">
            <ResumePaper resume={item.resume} changed={highlight ? changed : none} focus={none} />
          </div>
        </Card>
      </div>

      {/* Why it changed */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-sm font-semibold">What changed, and why ({item.edits.length})</h3>
            <p className="text-xs text-muted">Every edit is checked against your profile: nothing is invented.</p>
          </div>
          {item.edits.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No edits: your resume already fits this job as well as your profile allows.</p>
          ) : (
            <ul className="divide-y divide-line">
              {item.edits.map((c) => (
                <li key={c.id} className="space-y-1.5 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{OP_LABEL[c.op] ?? c.op}</Badge>
                    {c.reviewed && <Badge tone="info">{c.reviewed === "added" ? "Added by recruiter review" : "Improved by recruiter review"}</Badge>}
                    {c.keywords_added?.length ? <span className="text-xs text-muted">adds {c.keywords_added.join(", ")}</span> : null}
                  </div>
                  {c.op === "update_skills" ? (
                    <p className="[overflow-wrap:anywhere]">{(c.skills_after ?? []).join(", ")}</p>
                  ) : (
                    <>
                      {c.before && <p className="text-muted line-through decoration-faint [overflow-wrap:anywhere]">{c.before}</p>}
                      {c.after && <p className="[overflow-wrap:anywhere]">{c.after}</p>}
                    </>
                  )}
                  <p className="text-xs text-muted">{c.review_note || c.reason}</p>
                  {c.warnings?.length ? <p className="text-xs text-warning">Check: {c.warnings.join("; ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {item.review && item.review.notes.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Recruiter review</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {item.review.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {item.review.dropped.length > 0 && <p className="mt-2 text-xs text-muted">Dropped {item.review.dropped.length} weak edits.</p>}
            </Card>
          )}
          {item.gaps.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Skills it asks for that your resume can&apos;t show</h3>
              <p className="mt-1 text-xs text-muted">Not added, because your profile doesn&apos;t back them. If you do have them, add them in Resume Studio.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.gaps.map((g) => (
                  <SkillChip key={g} skill={g} state="missing" />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
