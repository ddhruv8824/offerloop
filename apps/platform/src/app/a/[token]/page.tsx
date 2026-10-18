import Link from "next/link";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, Card } from "@/components/ui";
import { linkJobIds } from "@/lib/server/approval-links";
import { lookupApprovalLink } from "@/lib/server/approval-lookup";
import { readStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approve jobs · Offerloop", robots: { index: false, follow: false } };

/**
 * Opened from a one-tap link in a Signal message. Shows what the link will do and asks for one
 * tap to confirm. Works without logging in: the link itself is the permission.
 */
export default async function ApprovalLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  if (done === "approved" || done === "skipped") {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-lg font-semibold">
          {done === "approved" ? <Check className="size-5 text-success" /> : <X className="size-5 text-muted" />}
          {done === "approved" ? "Approved" : "Skipped"}
        </p>
        <p className="mt-2 text-sm text-muted">
          {done === "approved"
            ? "The workflow carries on with these jobs. Hirist ones go to your PC agent, which applies within about 15 minutes."
            : "This run is cancelled. Nothing was applied to."}
        </p>
        <SiteLink />
      </Shell>
    );
  }

  const found = await lookupApprovalLink(token);
  const link = found?.link;
  const run = found && link ? (await readStore(found.uid)).runs.find((r) => r.id === link.runId) : undefined;
  if (!link || !run || run.status !== "waiting_approval") {
    return (
      <Shell>
        <p className="text-lg font-semibold">This link no longer works</p>
        <p className="mt-2 text-sm text-muted">
          It has expired (links last 24 hours), was already used, or the run was approved or replaced on the site.
        </p>
        <SiteLink />
      </Shell>
    );
  }

  const ids = new Set(linkJobIds(link, run));
  const jobs = [...run.jobs].sort((a, b) => b.score - a.score).filter((j) => ids.has(j.id));
  const skip = link.action === "skip";
  return (
    <Shell>
      <p className="text-sm text-muted">{run.workflowName}</p>
      <h1 className="mt-1 text-lg font-semibold">
        {skip ? `Skip this run (${run.jobs.length} jobs)?` : jobs.length === 1 ? "Approve this job?" : `Approve all ${jobs.length} jobs?`}
      </h1>
      {!skip && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-baseline gap-2 px-3 py-2">
              <span className="w-9 shrink-0 font-mono text-xs text-muted">{j.score}%</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                  {j.title}
                </a>{" "}
                <span className="text-muted">· {j.company}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form method="post" action={`/api/a/${encodeURIComponent(token)}`} className="mt-5">
        <Button type="submit" variant={skip ? "secondary" : "primary"} className="w-full py-3 text-base">
          {skip ? <X className="size-5" /> : <Check className="size-5" />} {skip ? "Skip this run" : "Approve"}
        </Button>
      </form>
      <p className="mt-3 text-center text-xs text-muted">
        Want to pick? <Link href="/automations" className="font-semibold text-coral-strong hover:underline">Choose on the site</Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <Card className="w-full max-w-md p-6">
        <Logo href="/automations" />
        <div className="mt-5">{children}</div>
      </Card>
    </main>
  );
}

function SiteLink() {
  return (
    <Link href="/automations" className="mt-5 inline-block text-sm font-semibold text-coral-strong hover:underline">
      Open Automations
    </Link>
  );
}
