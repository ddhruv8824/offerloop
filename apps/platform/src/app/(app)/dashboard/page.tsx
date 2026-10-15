"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ArrowRight, ChevronRight, FileText, ListChecks, Mail, Sparkles, Workflow, X, type LucideIcon } from "lucide-react";
import { RunUpdates } from "@/components/automations/RunUpdates";
import { JobFeed } from "@/components/jobs/JobFeed";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { TOOLS } from "@/lib/tools";
import { useTracker } from "@/lib/tracker";
import type { ApplicationStatus } from "@/lib/types";
import { describeTrigger, useWorkflows } from "@/lib/workflows";
import { greeting, plural } from "@/lib/utils";

const FUNNEL: { label: string; statuses: ApplicationStatus[] }[] = [
  { label: "Saved", statuses: ["saved"] },
  { label: "Applied", statuses: ["applied", "in_review", "assessment"] },
  { label: "Interviewing", statuses: ["interview"] },
  { label: "Offers", statuses: ["offer"] },
];

const FLOW_PREVIEW = ["Find jobs", "Tailor resume", "Your approval", "Track"];

/** Tools that work on the jobs found here. Finding jobs itself is the feed, not a card. */
const SHORTCUTS = TOOLS.filter((t) => t.group === "Tools" && !t.inDashboard);

/**
 * Home: jobs that fit you in the main column; your progress, next steps, the tools that act on
 * those jobs, and automations beside it.
 */
export default function Dashboard() {
  const { profile } = useProfile();
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    setWelcome(new URLSearchParams(window.location.search).has("welcome"));
  }, []);

  return (
    <div>
      {welcome && profile && (
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-ink px-5 py-4 text-paper">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-coral" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Your profile is ready, {profile.name}.</p>
            <p className="mt-0.5 text-paper/65">Jobs below are ranked for you. Track the ones you like, tailor your resume for them, or let a workflow do it daily.</p>
          </div>
          <button type="button" onClick={() => setWelcome(false)} className="rounded p-1 text-paper/60 hover:bg-paper/10" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{profile ? `${greeting()}, ${profile.name}` : "Your job switch workspace"}</h1>
        <p className="mt-1 text-sm text-muted">Jobs that fit you, and everything you need to land one.</p>
      </div>

      <RunUpdates />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <JobFeed />

        <aside className="flex flex-col gap-4 xl:sticky xl:top-8 xl:self-start" aria-label="Your progress and tools">
          {profile && <Progress />}
          <Shortcuts />
          <AutomateCard />
        </aside>
      </div>
    </div>
  );
}

function Progress() {
  const tracker = useTracker();
  if (!tracker) return null;
  const cards = tracker.cards;
  const count = (statuses: ApplicationStatus[]) => cards.filter((c) => statuses.includes(c.status)).length;
  const age = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  const interviewing = cards.find((c) => c.status === "interview");
  const assessment = cards.find((c) => c.status === "assessment");
  const stale = cards.find((c) => c.status === "applied" && age(c.updatedAt) >= 7);
  const toTailor = cards.find((c) => c.status === "saved" && !c.resumeVersion);

  const actions = [
    interviewing && {
      icon: ListChecks,
      title: `Prepare for ${interviewing.company}`,
      detail: interviewing.nextStep ?? "Practice their most-asked questions.",
      href: interviewing.companySlug ? `/dsa?company=${interviewing.companySlug}` : "/dsa",
    },
    assessment && {
      icon: ListChecks,
      title: `Assessment for ${assessment.company}`,
      detail: "Warm up on their most-asked questions.",
      href: assessment.companySlug ? `/dsa?company=${assessment.companySlug}` : "/dsa",
    },
    toTailor && {
      icon: FileText,
      title: `Tailor your resume for ${toTailor.company}`,
      detail: `${toTailor.title}${toTailor.matchScore != null ? ` · ${toTailor.matchScore}% match` : ""}`,
      href: "/resume",
    },
    stale && {
      icon: Mail,
      title: `Follow up with ${stale.company}`,
      detail: `Applied ${age(stale.updatedAt)} days ago, no reply.`,
      href: "/tracker",
    },
  ].filter(Boolean) as { icon: LucideIcon; title: string; detail: string; href: string }[];

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-semibold">Your switch so far</h2>
        <Link href="/tracker" className="text-xs font-semibold text-coral-strong hover:underline">
          Tracker
        </Link>
      </div>
      <dl className="grid grid-cols-4 gap-1 px-4 pt-3 pb-4">
        {FUNNEL.map((f) => (
          <div key={f.label} className="rounded-md bg-ink/[0.03] px-1 py-2 text-center">
            <dd className="font-display text-xl font-semibold">{count(f.statuses)}</dd>
            <dt className="text-[10px] text-muted">{f.label}</dt>
          </div>
        ))}
      </dl>
      <div className="border-t border-line">
        <p className="px-4 pt-3 text-xs font-semibold text-muted uppercase">Do next</p>
        {actions.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-xs text-muted">Nothing urgent. Track a few jobs and suggestions show up here.</p>
        ) : (
          <ul className="pb-2">
            {actions.map(({ icon: Icon, title, detail, href }) => (
              <li key={title}>
                <Link href={href} className="group flex items-center gap-3 px-4 py-2 hover:bg-ink/[0.03]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-coral-wash text-coral-strong">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{title}</span>
                    <span className="block truncate text-xs text-muted">{detail}</span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-faint group-hover:text-coral-strong" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Shortcuts() {
  return (
    <Card>
      <h2 className="px-4 pt-4 text-sm font-semibold">Your tools</h2>
      <ul className="py-2">
        {SHORTCUTS.map((tool) => {
          const Icon = tool.icon;
          const soon = tool.status === "planned";
          return (
            <li key={tool.id}>
              <Link href={tool.href} className="group flex items-center gap-3 px-4 py-2 hover:bg-ink/[0.03]">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-coral-wash text-coral-strong">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{tool.name}</span>
                  <span className="block truncate text-xs text-muted">{tool.tagline}</span>
                </span>
                {soon ? <Badge>Soon</Badge> : <ArrowRight className="size-3.5 shrink-0 text-faint group-hover:text-coral-strong" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AutomateCard() {
  const { workflows } = useWorkflows();
  const active = workflows.filter((w) => w.enabled);
  return (
    <div className="rounded-lg bg-ink p-4 text-paper">
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-md bg-coral text-ink">
          <Workflow className="size-4" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold">Automate it</h2>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1 text-[11px]" aria-label="Example workflow">
        {FLOW_PREVIEW.map((step, i) => (
          <Fragment key={step}>
            {i > 0 && <ChevronRight className="size-3 text-paper/35" aria-hidden />}
            <span className="rounded-sm bg-paper/10 px-1.5 py-0.5 text-paper/85">{step}</span>
          </Fragment>
        ))}
      </div>
      <p className="mt-3 text-xs text-paper/55">
        {active.length > 0
          ? `${plural(active.length, "active workflow")} · ${active[0].name}: ${describeTrigger(active[0].trigger).toLowerCase()}`
          : "Runs on a schedule and always waits for your approval."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href="/automations/builder" className="px-3 py-1.5 text-xs">
          Build a workflow
        </ButtonLink>
        <ButtonLink href="/automations" variant="ghost" className="px-3 py-1.5 text-xs text-paper/75 hover:bg-paper/10 hover:text-paper">
          {workflows.length ? "My workflows" : "Templates"}
        </ButtonLink>
      </div>
    </div>
  );
}
