// Talks to your Offerloop site: which approved Hirist jobs are waiting, and what happened
// with each. Authenticated with the agent key made on Offerloop's Automations page.

export type QueueStatus = "applied" | "already_applied" | "needs_input" | "skipped" | "failed" | "requeue";

export type QueuedJob = {
  id: string;
  hiristId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  /** A resume tailored to this job is waiting (see resumePdf). */
  tailoredResume?: boolean;
};

export type OfferloopClient = {
  hello: () => Promise<{ queued: number; remainingToday: number; dailyLimit: number }>;
  /** Take up to `want` approved jobs (they're marked in progress until reported). */
  take: (want: number) => Promise<{ jobs: QueuedJob[]; remainingToday: number }>;
  report: (id: string, status: QueueStatus, message?: string) => Promise<void>;
  /** A resume as PDF: the one tailored to a queued job, or "main" (your Resume Studio resume). */
  resumePdf: (which: { item: string } | "main") => Promise<Uint8Array>;
  /** Tell Offerloop the agent is stuck (shown on the Automations page), or null once it works again. */
  problem: (message: string | null) => Promise<void>;
};

export class OfferloopError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function createOfferloopClient(baseUrl: string, key: string): OfferloopClient {
  const base = baseUrl.replace(/\/+$/, "");
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(60_000), // a sleeping free server takes up to a minute to wake
      });
    } catch (error) {
      throw new OfferloopError(`Couldn't reach ${base} (${error instanceof Error ? error.message : error}).`);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new OfferloopError(body.error ?? `Offerloop answered ${res.status}.`, res.status);
    return body as T;
  }
  return {
    hello: () => call("/api/agent/hello"),
    take: (want) => call("/api/agent/queue", { method: "POST", body: JSON.stringify({ want }) }),
    report: async (id, status, message) => {
      await call("/api/agent/result", { method: "POST", body: JSON.stringify({ id, status, message }) });
    },
    resumePdf: async (which) => {
      const query = which === "main" ? "main=1" : `item=${encodeURIComponent(which.item)}`;
      let res: Response;
      try {
        res = await fetch(`${base}/api/agent/resume?${query}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(90_000) });
      } catch (error) {
        throw new OfferloopError(`Couldn't reach ${base} (${error instanceof Error ? error.message : error}).`);
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new OfferloopError(body.error ?? `Offerloop answered ${res.status}.`, res.status);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
    problem: async (message) => {
      await call("/api/agent/hello", { method: "POST", body: JSON.stringify({ problem: message }) });
    },
  };
}
