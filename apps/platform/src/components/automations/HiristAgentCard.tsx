"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Laptop, Loader2, Unplug, X } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { DAILY_APPLY_LIMIT, startedToday } from "@/lib/apply-queue";
import { createAgentKey, disconnectAgent, removeFromApplyQueue, type AgentStatus, type ApplyItem } from "@/lib/workflows";
import { BASE_PATH, withBase } from "@/lib/base-path";

const GUIDE_URL = withBase("/docs/hirist-agent");

const STATUS: Record<ApplyItem["status"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  queued: { label: "Waiting for your PC", tone: "neutral" },
  in_progress: { label: "Applying…", tone: "info" },
  applied: { label: "Applied", tone: "success" },
  already_applied: { label: "Already applied", tone: "success" },
  needs_input: { label: "Needs you", tone: "warning" },
  skipped: { label: "Not on Hirist", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  removed: { label: "Removed", tone: "neutral" },
};

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/**
 * The job agent on the user's PC: connect it (a key shown once), and see what it's doing —
 * approved Hirist jobs waiting, applied, or needing the person.
 */
export function HiristAgentCard({ agent, queue }: { agent: AgentStatus; queue: ApplyItem[] }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const active = queue.filter((q) => q.status === "queued" || q.status === "in_progress");
  const waiting = active.length;
  // Every job still waiting (so each can be removed), then the latest results.
  const shown = [...active, ...queue.filter((q) => !active.includes(q)).slice(0, 8)];
  const needsYou = queue.filter((q) => q.status === "needs_input").length;
  const today = startedToday(queue);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const removeJob = async (item: ApplyItem) => {
    setRemoving(item.id);
    setError("");
    try {
      await removeFromApplyQueue(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it. Try again.");
    } finally {
      setRemoving(null);
    }
  };
  const newKey = () =>
    act(async () => {
      if (agent.connected && !confirm("Make a new key? The agent stops working until you put the new key in its .env file.")) return;
      setKey(await createAgentKey());
      setCopied(false);
    });
  const disconnect = () =>
    act(async () => {
      if (!confirm("Disconnect the job agent? Approved jobs stay queued until you connect again.")) return;
      setKey(null);
      await disconnectAgent();
    });

  const envLines = key ? `OFFERLOOP_URL=${typeof window === "undefined" ? "" : `${window.location.origin}${BASE_PATH}`}\nOFFERLOOP_AGENT_KEY=${key}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(envLines);
      setCopied(true);
    } catch {
      setError("Couldn't copy — select the text and copy it by hand.");
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Laptop className="size-4" aria-hidden /> Hirist agent
          </span>
        }
        subtitle={`Applies to the Hirist jobs you approve, from your own logged-in Chrome on your PC. At most ${DAILY_APPLY_LIMIT} a day.`}
        action={
          agent.connected ? (
            <div className="flex gap-2">
              <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={newKey}>
                <KeyRound className="size-3.5" aria-hidden /> New key
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={disconnect}>
                <Unplug className="size-3.5" aria-hidden /> Disconnect
              </Button>
            </div>
          ) : (
            <Button className="px-3 py-1.5 text-xs" disabled={busy} onClick={newKey}>
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <KeyRound className="size-3.5" aria-hidden />} Connect your PC
            </Button>
          )
        }
      />
      <div className="space-y-4 px-5 py-4 text-sm">
        {error && <p className="text-danger">{error}</p>}

        {agent.connected && agent.problem && (
          <div className="rounded-md border border-warning/40 bg-warning-wash/50 p-3">
            <p className="font-semibold">Your agent is stuck and needs you ({ago(agent.problem.at)})</p>
            <p className="mt-1 text-muted">{agent.problem.message}</p>
            <p className="mt-1 text-xs text-faint">Approved jobs stay queued. Once it&apos;s fixed, the next check (within 15 minutes) carries on.</p>
          </div>
        )}

        {key && (
          <div className="rounded-md border border-warning/40 bg-warning-wash/50 p-4">
            <p className="font-semibold">Your agent key — copy it now, it won&apos;t be shown again.</p>
            <p className="mt-1 text-muted">
              Paste these two lines into <code className="font-mono text-xs">services/job-agent/.env</code> on your PC, then run{" "}
              <code className="font-mono text-xs">npm run connect</code> there.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs text-paper">{envLines}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={copy}>
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy"}
              </Button>
              <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-coral-strong hover:underline">
                Setup guide <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </div>
        )}

        {!agent.connected && !key && (
          <p className="text-muted">
            Your Hirist login never leaves your PC: the agent applies from a Chrome window you log in to yourself, and only for jobs you approved
            in a workflow.{" "}
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="font-semibold text-coral-strong hover:underline">
              How it works
            </a>
          </p>
        )}

        {agent.connected && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted">
            <span>
              {agent.lastSeenAt ? (
                <>
                  Agent last checked in <span className="font-semibold text-text">{ago(agent.lastSeenAt)}</span>
                </>
              ) : (
                "Key made — the agent hasn't checked in yet. Run npm run connect on your PC."
              )}
            </span>
            <span>
              <span className="font-semibold text-text">{waiting}</span> waiting
            </span>
            <span>
              <span className="font-semibold text-text">
                {today}/{DAILY_APPLY_LIMIT}
              </span>{" "}
              started in the last 24 h
            </span>
            {needsYou > 0 && (
              <span className="text-warning">
                <span className="font-semibold">{needsYou}</span> need you
              </span>
            )}
          </div>
        )}

        {shown.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                    {item.title}
                  </a>{" "}
                  <span className="text-muted">· {item.company}</span>
                  {item.message && <p className="text-xs text-muted">{item.message}</p>}
                </div>
                <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                <span className="w-16 text-right text-xs text-faint">{ago(item.updatedAt)}</span>
                {item.status === "queued" && (
                  <button
                    type="button"
                    onClick={() => removeJob(item)}
                    disabled={removing === item.id}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-ink/5 hover:text-danger disabled:opacity-50"
                    title="Take this job out of the queue — the agent won't apply to it"
                    aria-label={`Remove ${item.title} from the queue`}
                  >
                    {removing === item.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />} Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
