"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageCircle, RotateCw, Send, X } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

const GUIDE_URL = "/docs/signal";

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
  const [phone, setPhone] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: "", apikey: "" });
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<SignalResult | null>(null);
  const [busy, setBusy] = useState<"test" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/automations/signal")
      .then((r) => r.json())
      .then((d: { configured?: boolean; phone?: string | null; last?: SignalResult | null }) => {
        setConfigured(Boolean(d.configured));
        setPhone(d.phone ?? null);
        setLast(d.last ?? null);
      })
      .catch(() => setConfigured(false));
  }, []);
  useEffect(load, [load]);

  /** Save ({ phone, apikey }) or remove ({ remove: true }) this person's CallMeBot details. */
  const saveSettings = async (body: object) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't save that.");
      else {
        setForm({ phone: "", apikey: "" });
        load();
      }
    } finally {
      setSaving(false);
    }
  };

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
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSettings(form);
            }}
          >
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                On your phone, open callmebot.com → <b>Signal</b>, save the bot&apos;s number, and send it: <i>I allow callmebot to send me messages</i>
              </li>
              <li>
                It replies with a link like <code className="font-mono text-xs">send.php?phone=c242bb7d-…&amp;apikey=123456</code>. Paste the two values here.
              </li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="phone= value, e.g. c242bb7d-…"
                aria-label="CallMeBot phone value"
                className="flex-1 rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs"
              />
              <input
                value={form.apikey}
                onChange={(e) => setForm({ ...form, apikey: e.target.value })}
                placeholder="apikey= value"
                aria-label="CallMeBot API key"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs sm:w-36"
              />
              <Button type="submit" className="px-3 py-1.5 text-xs" disabled={saving || !form.phone.trim() || !form.apikey.trim()}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
              </Button>
            </div>
            <p className="text-xs text-faint">
              The key is stored encrypted. Messages carry job titles and links, never your keys or passwords.{" "}
              <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-coral-strong hover:underline">
                Guide <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
          </form>
        )}
        {configured && phone && (
          <p className="text-xs text-muted">
            Sending to CallMeBot account <span className="font-mono">{phone}</span> ·{" "}
            <button type="button" className="font-semibold text-coral-strong hover:underline" disabled={saving} onClick={() => confirm("Remove your Signal alerts settings?") && void saveSettings({ remove: true })}>
              Remove
            </button>
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
