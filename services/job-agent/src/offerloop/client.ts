// Talks to your Offerloop site: which approved Hirist jobs are waiting, and what happened
// with each. Authenticated with the agent key made on Offerloop's Automations page.

export type QueueStatus = "applied" | "already_applied" | "needs_input" | "skipped" | "failed" | "requeue";

export type QueuedJob = { id: string; hiristId: string; title: string; company: string; location?: string; url: string };

export type OfferloopClient = {
  hello: () => Promise<{ queued: number; remainingToday: number; dailyLimit: number }>;
  /** Take up to `want` approved jobs (they're marked in progress until reported). */
  take: (want: number) => Promise<{ jobs: QueuedJob[]; remainingToday: number }>;
  report: (id: string, status: QueueStatus, message?: string) => Promise<void>;
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
  };
}
