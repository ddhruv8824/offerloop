"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageCircle, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

const GUIDE_URL = "https://github.com/ddhruv8824/offerloop/blob/main/deploy/RENDER.md#signal-alerts-optional";

/** Signal alerts: whether they're set up on the server, and a test button. */
export function SignalCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/automations/signal")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const test = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/automations/signal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setResult(res.ok ? { ok: true, text: "Sent — check Signal on your phone (it can take a minute)." } : { ok: false, text: body.error ?? "Couldn't send it." });
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setSending(false);
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
        subtitle="A Signal message when a workflow is waiting for your approval, with the best jobs and a link to approve."
        action={
          configured ? (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={test} disabled={sending}>
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send a test
            </Button>
          ) : undefined
        }
      />
      <div className="px-5 py-4 text-sm">
        {configured === false && (
          <p className="text-muted">
            Message CallMeBot&apos;s Signal bot once to get a key, then add <code className="font-mono text-xs">SIGNAL_PHONE</code> and{" "}
            <code className="font-mono text-xs">SIGNAL_CALLMEBOT_KEY</code> in Render → Environment.{" "}
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-coral-strong hover:underline">
              How to set it up <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        )}
        {configured && !result && <p className="text-muted">Messages go through CallMeBot&apos;s free relay: job titles and a link, never your keys or passwords.</p>}
        {result && (
          <p className={result.ok ? "flex items-center gap-1.5 text-success" : "text-danger"}>
            {result.ok && <Check className="size-4" aria-hidden />} {result.text}
          </p>
        )}
      </div>
    </Card>
  );
}
