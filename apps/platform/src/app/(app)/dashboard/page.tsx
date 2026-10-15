"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ArrowRight, ChevronRight, FileText, ListChecks, Mail, Mic, Sparkles, Workflow, X } from "lucide-react";
import { RunUpdates } from "@/components/automations/RunUpdates";
import { ProfilePrompt } from "@/components/ProfilePrompt";
import { Badge, ButtonLink, Card, CardHeader, StatCard } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { STANDALONE_TOOLS } from "@/lib/tools";
import { useTracker } from "@/lib/tracker";
import type { ApplicationStatus } from "@/lib/types";
import { describeTrigger, useWorkflows } from "@/lib/workflows";
import { greeting, plural } from "@/lib/utils";

const FUNNEL: { status: ApplicationStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interview", label: "Interviewing" },
  { status: "offer", label: "Offers" },
];

const FLOW_PREVIEW = ["Find jobs", "Tailor resume", "Your approval", "Track"];

export default function Dashboard() {
  const { profile } = useProfile();
  const { workflows } = useWorkflows();
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    setWelcome(new URLSearchParams(window.location.search).has("welcome"));
  }, []);

  const active = workflows.filter((w) => w.enabled);

  return (
    <div>
      {welcome && profile && (
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-ink px-5 py-4 text-paper">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-coral" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Your profile is ready, {profile.name}.</p>
            <p className="mt-0.5 text-paper/65">Tools will now pre-fill from it. Open any tool below, or automate them together.</p>
          </div>
          <button type="button" onClick={() => setWelcome(false)} className="rounded p-1 text-paper/60 hover:bg-paper/10" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{profile ? `${greeting()}, ${profile.name}` : "Your job switch workspace"}</h1>
        <p className="mt-1 text-sm text-muted">Open any tool on its own — or automate them together in the last card.</p>
      </div>

      <RunUpdates />

      {/* Tools: each one works on its own */}
      <section aria-label="Tools" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STANDALONE_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.id} href={tool.href} className="group">
              <Card className="flex h-full flex-col p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-faint group-hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-coral-wash text-coral-strong">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {tool.status === "planned" ? <Badge>Coming soon</Badge> : <Badge tone="success">Standalone</Badge>}
                </div>
                <h2 className="mt-4 text-base font-semibold">{tool.name}</h2>
                <p className="mt-0.5 text-sm text-muted">{tool.tagline}</p>
                <p className="mt-3 flex-1 text-sm text-text/80">{tool.bring}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-xs text-muted">{tool.origin ? `Powered by ${tool.origin}` : "New module"}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-coral-strong">
                    Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}

        {/* Last card: automate with all tools */}
        <div className="flex flex-col rounded-lg bg-ink p-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-coral text-ink">
              <Workflow className="size-5" aria-hidden />
            </span>
            <Badge className="bg-paper/10 text-paper/80">All tools</Badge>
          </div>
          <h2 className="mt-4 text-base font-semibold">Automate with all tools</h2>
          <p className="mt-0.5 text-sm text-paper/60">You decide the workflow: which tools, in what order, and when it runs.</p>

          <div className="mt-4 flex flex-wrap items-center gap-1 text-xs" aria-label="Example workflow">
            {FLOW_PREVIEW.map((step, i) => (
              <Fragment key={step}>
                {i > 0 && <ChevronRight className="size-3 text-paper/35" aria-hidden />}
                <span className="rounded-sm bg-paper/10 px-2 py-1 text-paper/85">{step}</span>
              </Fragment>
            ))}
          </div>

          <p className="mt-4 flex-1 text-xs text-paper/50">
            {active.length > 0
              ? `${plural(active.length, "active workflow")} · ${active[0].name}: ${describeTrigger(active[0].trigger).toLowerCase()}`
              : "Nothing is applied for you without your approval — workflows pause and wait."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-paper/10 pt-3">
            <ButtonLink href="/automations/builder" className="px-3 py-1.5 text-sm">
              Build a workflow
            </ButtonLink>
            <ButtonLink href="/automations" variant="ghost" className="px-3 py-1.5 text-sm text-paper/75 hover:bg-paper/10 hover:text-paper">
              {workflows.length ? "My workflows" : "Templates"}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Progress across tools (needs the profile) */}
      <section className="mt-10" aria-label="Your progress">
        <h2 className="mb-3 text-sm font-semibold text-muted">Your switch so far</h2>
        {profile ? (
          <Progress />
        ) : (
          <ProfilePrompt title="See your progress across every tool">
            Tools work without a profile. Add one to get a tracker, ranked jobs and suggested next steps here.
          </ProfilePrompt>
        )}
      </section>
    </div>
  );
}

function Progress() {
  const tracker = useTracker();
  if (!tracker) return null;
  const cards = tracker.cards;
  const count = (statuses: ApplicationStatus[]) => cards.filter((c) => statuses.includes(c.status)).length;
  const counts: Record<string, number> = {
    saved: count(["saved"]),
    applied: count(["applied", "in_review", "assessment"]),
    interview: count(["interview"]),
    offer: count(["offer"]),
  };
  const age = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  const interviewing = cards.find((c) => c.status === "interview");
  const assessment = cards.find((c) => c.status === "assessment");
  const stale = cards.find((c) => c.status === "applied" && age(c.updatedAt) >= 7);
  const toTailor = cards.find((c) => c.status === "saved" && !c.resumeVersion);

  const actions = [
    interviewing && {
      icon: ListChecks,
      title: `Prepare for ${interviewing.company}`,
      detail: interviewing.nextStep ?? `${interviewing.title} — you're interviewing. Practice their most-asked questions.`,
      href: interviewing.companySlug ? `/dsa?company=${interviewing.companySlug}` : "/dsa",
      cta: "DSA Prep",
    },
    assessment && {
      icon: ListChecks,
      title: `Assessment for ${assessment.company}`,
      detail: `${assessment.title} — warm up on their most-asked questions.`,
      href: assessment.companySlug ? `/dsa?company=${assessment.companySlug}` : "/dsa",
      cta: "DSA Prep",
    },
    toTailor && {
      icon: FileText,
      title: `Tailor your resume for ${toTailor.title}`,
      detail: `${toTailor.company}${toTailor.matchScore != null ? ` · ${toTailor.matchScore}% match` : ""}. Saved, not applied yet.`,
      href: "/resume",
      cta: "Tailor",
    },
    stale && {
      icon: Mail,
      title: `Follow up with ${stale.company}`,
      detail: `Applied ${age(stale.updatedAt)} days ago, no reply.`,
      href: "/tracker",
      cta: "Open",
    },
  ].filter(Boolean) as { icon: typeof Mic; title: string; detail: string; href: string; cta: string }[];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="grid grid-cols-2 gap-3">
        {FUNNEL.map((f) => (
          <StatCard key={f.status} label={f.label} value={counts[f.status]} />
        ))}
      </div>
      <Card>
        <CardHeader
          title="Do next"
          subtitle="From your tracker, highest impact first"
          action={
            <Link href="/tracker" className="text-sm font-semibold text-coral-strong hover:underline">
              Tracker
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {actions.length === 0 && <li className="px-5 py-4 text-sm text-muted">Nothing urgent. Track a few jobs and suggestions show up here.</li>}
          {actions.map(({ icon: Icon, title, detail, href, cta }) => (
            <li key={title} className="flex items-center gap-4 px-5 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-coral-wash text-coral-strong">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted">{detail}</p>
              </div>
              <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-coral-strong hover:underline">
                {cta} <ArrowRight className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
