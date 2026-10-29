"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { rememberInboxAccount } from "@/lib/gmail-link";
import { applyDetections, companiesToWatch, type InboxDetection, type ScanSummary, type TrackerCard } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { BASE_PATH, withBase } from "@/lib/base-path";

interface InboxStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  sampleAvailable: boolean;
}

const RETURN_MESSAGES: Record<string, { tone: "success" | "danger" | "info"; text: string }> = {
  connected: { tone: "success", text: "Gmail connected. Checking for application updates…" },
  cancelled: { tone: "info", text: "Gmail connection cancelled. Nothing was shared." },
  failed: { tone: "danger", text: "Couldn't connect Gmail. Please try again." },
  "not-configured": { tone: "info", text: "Gmail isn't set up on this server yet — see the setup steps below." },
};

function describe(summary: ScanSummary, checked: number) {
  const parts = [];
  if (summary.moved) parts.push(`${summary.moved} card${summary.moved === 1 ? "" : "s"} updated`);
  if (summary.suggested) parts.push(`${summary.suggested} need${summary.suggested === 1 ? "s" : ""} your review`);
  if (summary.logged) parts.push(`${summary.logged} logged`);
  if (!parts.length) return checked ? `Checked ${checked} new email${checked === 1 ? "" : "s"} — no application updates.` : "No new job emails since the last check.";
  return `${parts.join(" · ")}.`;
}

/** Connect Gmail (read-only) and turn job emails into tracker updates. */
export function InboxPanel({ cards, processed, lastScanAt }: { cards: TrackerCard[]; processed: string[]; lastScanAt?: string }) {
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [busy, setBusy] = useState<"scan" | "sample" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(withBase("/api/inbox/status"), { cache: "no-store" });
      const next = (await res.json()) as InboxStatus;
      setStatus(next);
      rememberInboxAccount(next.connected ? next.email : null);
    } catch {
      setStatus({ configured: false, connected: false, email: null, sampleAvailable: false });
    }
  }, []);

  const scan = useCallback(
    async (sample = false) => {
      setBusy(sample ? "sample" : "scan");
      setMessage(null);
      try {
        const res = await fetch(withBase("/api/inbox/scan"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companies: companiesToWatch(cards), days: 30, skip: processed, sample }),
        });
        const data = (await res.json()) as { checked?: number; checkedIds?: string[]; detections?: InboxDetection[]; error?: string };
        if (!res.ok) {
          setMessage({ tone: "danger", text: data.error ?? "Couldn't check the inbox." });
          if (res.status === 401) void loadStatus();
          return;
        }
        const summary = applyDetections(data.detections ?? [], data.checkedIds ?? []);
        setMessage({ tone: summary.moved || summary.suggested ? "success" : "info", text: (sample ? "Sample inbox: " : "") + describe(summary, data.checked ?? 0) });
      } catch {
        setMessage({ tone: "danger", text: "Couldn't reach the server." });
      } finally {
        setBusy(null);
      }
    },
    [cards, processed, loadStatus],
  );

  useEffect(() => {
    void loadStatus();
    // Back from Google sign-in: show the result once, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("inbox");
    if (result && RETURN_MESSAGES[result]) {
      setMessage(RETURN_MESSAGES[result]);
      if (result === "not-configured") setShowSetup(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loadStatus]);

  // First visit after connecting: check right away.
  useEffect(() => {
    if (status?.connected && !lastScanAt && busy === null) void scan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  const disconnect = async () => {
    setBusy("disconnect");
    await fetch(withBase("/api/inbox/disconnect"), { method: "POST" }).catch(() => undefined);
    await loadStatus();
    setBusy(null);
    setMessage({ tone: "info", text: "Gmail disconnected and access revoked." });
  };

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-coral-wash text-coral-strong">
          <Mail className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Automatic updates from your inbox</p>
            {status?.connected ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3" aria-hidden /> {status.email}
              </Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {status?.connected
              ? `Reads job emails and moves cards when you're in review, get an assessment or interview, an offer, or a rejection.${lastScanAt ? ` Last checked ${new Date(lastScanAt).toLocaleString()}.` : ""}`
              : "Connect Gmail and cards move by themselves: in review, assessment, interview, offer or rejected."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === null ? (
            <Loader2 className="size-5 animate-spin text-muted" aria-label="Checking connection" />
          ) : status.connected ? (
            <>
              <Button onClick={() => scan(false)} disabled={busy !== null}>
                {busy === "scan" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Check now
              </Button>
              <Button variant="ghost" onClick={disconnect} disabled={busy !== null}>
                <Unplug className="size-4" /> Disconnect
              </Button>
            </>
          ) : (
            <>
              {status.configured ? (
                // A full page load (not <Link>): this route redirects to Google.
                <a
                  href={withBase("/api/inbox/google/connect")}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-coral-strong hover:text-paper"
                >
                  <Mail className="size-4" /> Connect Gmail
                </a>
              ) : (
                <Button variant="secondary" onClick={() => setShowSetup((v) => !v)}>
                  Set up Gmail
                </Button>
              )}
              {status.sampleAvailable && (
                <Button variant="ghost" onClick={() => scan(true)} disabled={busy !== null} title="Development only: runs the detector on 5 built-in sample emails">
                  {busy === "sample" ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Try a sample inbox
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={cn(
            "mt-4 rounded-md px-3 py-2 text-sm",
            message.tone === "success" && "bg-success-wash text-success",
            message.tone === "danger" && "bg-danger-wash text-danger",
            message.tone === "info" && "bg-info-wash text-info",
          )}
        >
          {message.text}
        </p>
      )}

      {!status?.connected && (
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
          Read-only access. Offerloop only looks at job-related emails, keeps the result (e.g. “Rejected · Oct 9”) and never stores the email itself. It can&apos;t send,
          delete or mark anything. Disconnect any time.
        </p>
      )}

      {showSetup && status && !status.configured && (
        <div className="mt-4 rounded-md border border-line bg-canvas p-4 text-sm">
          <p className="font-semibold">One-time setup (server owner)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>In Google Cloud Console, create a project and enable the Gmail API.</li>
            <li>OAuth consent screen: External, add yourself as a test user, add the gmail.readonly scope.</li>
            <li>
              Credentials → OAuth client ID → Web application, redirect URI{" "}
              <code className="rounded bg-ink/5 px-1 font-mono text-xs">{typeof window !== "undefined" ? window.location.origin + BASE_PATH : ""}/api/inbox/google/callback</code>
            </li>
            <li>
              Put <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code>, <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> and{" "}
              <code className="font-mono text-xs">INBOX_SECRET</code> in <code className="font-mono text-xs">apps/platform/.env.local</code>, then restart.
            </li>
          </ol>
        </div>
      )}
    </Card>
  );
}
