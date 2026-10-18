"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageCircle, RotateCw, Send, X } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

const GUIDE_URL = "https://github.com/ddhruv8824/offerloop/blob/main/deploy/RENDER.md#signal-alerts-optional";

interface SignalResult {
  ok: boolean;
  at: string;
  kind: "test" | "approval";
  detail: string;
}

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Signal alerts: whether they're set up, how the last message went, a test and a resend button. */
export function SignalCard({ waitingRunId }: { waitingRunId?: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [last, setLast] = useState<SignalResult | null>(null);
  const [busy, setBusy] = useState<"test" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/automations/signal")
      .then((r) => r.json())
      .then((d: { configured?: boolean; last?: SignalResult | null }) => {
        setConfigured(Boolean(d.configured));
        setLast(d.last ?? null);
      })
      .catch(() => setConfigured(false));
  }, []);
  useEffect(load, [load]);

  const send = async (what: "test" | "resend") => {
    setBusy(what);
    setError(null);
    try {
      const res = await fetch("/api/automations/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(what === "resend" ? { resend: waitingRunId } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; last?: SignalResult };
      if (body.last) setLast(body.last);
      else if (!res.ok) setError(body.error ?? "Couldn't send it.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <MessageCircle className="size-4" aria-hidden /> Signal alerts
            {configured !== null && <Badge tone={configured ? "success" : "neutral"}>{configured ? "On" : "Not set up"}</Badge>}
          </span>
        }
        subtitle="A Signal message when a workflow is waiting for your approval, with one-tap approve links."
        action={
          configured ? (
            <div className="flex flex-wrap gap-2">
              {waitingRunId && (
                <Button className="px-3 py-1.5 text-xs" onClick={() => send("resend")} disabled={busy !== null}>
                  {busy === "resend" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />} Resend approval message
                </Button>
              )}
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => send("test")} disabled={busy !== null}>
                {busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send a test
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="space-y-2 px-5 py-4 text-sm">
        {configured === false && (
          <p className="text-muted">
            Message CallMeBot&apos;s Signal bot once to get a key, then add <code className="font-mono text-xs">SIGNAL_PHONE</code> and{" "}
            <code className="font-mono text-xs">SIGNAL_CALLMEBOT_KEY</code> in Render → Environment.{" "}
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-coral-strong hover:underline">
              How to set it up <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        )}
        {configured && last && (
          <div className={last.ok ? "text-muted" : "text-danger"}>
            <p className="flex items-center gap-1.5">
              {last.ok ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4" aria-hidden />}
              Last {last.kind === "test" ? "test" : "approval message"}: {last.ok ? "handed to CallMeBot" : "failed"} · {ago(last.at)}
            </p>
            <p className="mt-0.5 text-xs [overflow-wrap:anywhere]">{last.ok ? `CallMeBot replied: ${last.detail}` : last.detail}</p>
            {last.ok && <p className="mt-0.5 text-xs text-faint">Not in Signal after a few minutes? CallMeBot accepted it but didn&apos;t deliver — check its reply above.</p>}
          </div>
        )}
        {configured && !last && <p className="text-muted">No message sent yet. Messages carry job titles and links, never your keys or passwords.</p>}
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Card>
  );
}
