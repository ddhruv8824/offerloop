"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { loadLlmSettings } from "@offerloop/resume-studio/llm";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { withBase } from "@/lib/base-path";

interface Provider {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
  keyUrl: string;
}

interface Status {
  configured: boolean;
  provider: string | null;
  model: string | null;
  key: string | null;
  serverKey: boolean;
  providers: Provider[];
}

/**
 * The AI key automations tailor resumes with. Resume Studio keeps its key in this browser
 * only, so a workflow running at 9 AM needs its own copy: saved encrypted on the server.
 */
export function AiKeyCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ provider: "gemini", model: "", apiKey: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studioKey, setStudioKey] = useState<{ provider: string; model: string; apiKey: string } | null>(null);

  const load = useCallback(() => {
    fetch(withBase("/api/automations/ai"))
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => setError("Couldn't load your AI settings."));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    // The key Resume Studio remembers in this browser, offered with one click.
    const s = loadLlmSettings();
    if (s.apiKey) setStudioKey({ provider: s.provider, model: s.model, apiKey: s.apiKey });
  }, []);

  const provider = status?.providers.find((p) => p.id === form.provider);

  const save = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase("/api/automations/ai"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't save that.");
      else {
        setForm((f) => ({ ...f, apiKey: "" }));
        setEditing(false);
        load();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const showForm = status !== null && (!status.configured || editing);

  return (
    <Card className="mb-8">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden /> AI for tailoring
            {status && <Badge tone={status.configured || status.serverKey ? "success" : "neutral"}>{status.configured ? "On" : status.serverKey ? "Server key" : "Not set up"}</Badge>}
          </span>
        }
        subtitle="The “Tailor my resume” step uses this key to tailor your Resume Studio resume to each job, even when this tab is closed."
        action={
          status?.configured && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditing(true)} disabled={busy}>
                <KeyRound className="size-3.5" aria-hidden /> Change
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void save({ remove: true })} disabled={busy}>
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        {error && <p className="text-danger">{error}</p>}
        {status === null && <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading" />}

        {status?.configured && !editing && (
          <p className="text-muted">
            Using <span className="font-semibold text-text">{status.providers.find((p) => p.id === status.provider)?.label ?? status.provider}</span> ·{" "}
            <span className="font-mono text-xs">{status.model}</span> with key <span className="font-mono text-xs">{status.key}</span>. Stored encrypted; never shown again.
          </p>
        )}

        {showForm && (
          <>
            {studioKey && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-canvas px-3 py-2">
                <span className="text-muted">
                  Resume Studio in this browser has a {status.providers.find((p) => p.id === studioKey.provider)?.label ?? studioKey.provider} key.
                </span>
                <Button className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => void save(studioKey)}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Use that key
                </Button>
              </div>
            )}
            <form
              className="flex flex-col gap-2 lg:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void save(form);
              }}
            >
              <select
                value={form.provider}
                onChange={(e) => setForm({ provider: e.target.value, model: "", apiKey: form.apiKey })}
                aria-label="AI provider"
                className="rounded-md border border-line bg-paper px-3 py-2 text-sm"
              >
                {status.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                value={form.model || provider?.defaultModel || ""}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                aria-label="Model"
                className="rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs"
              >
                {(provider?.models ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Paste your API key"
                aria-label="API key"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button type="submit" className="px-3 py-1.5 text-xs" disabled={busy || form.apiKey.trim().length < 10}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Check & save
                </Button>
                {editing && (
                  <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
            <p className="text-xs text-muted">
              Gemini has a free tier: get a key at{" "}
              <a href={provider?.keyUrl ?? "https://aistudio.google.com/apikey"} target="_blank" rel="noreferrer" className="font-semibold text-coral-strong hover:underline">
                {provider?.id === "gemini" || !provider ? "Google AI Studio" : provider.label} <ExternalLink className="inline size-3" aria-hidden />
              </a>
              . The key is checked, then stored encrypted. Each resume takes about 3 AI requests.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
