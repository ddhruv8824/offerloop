// Server only. Shared fetch helpers for the job-source connectors.

const UA = "Offerloop/0.1 (job search for the signed-in user)";

export class SourceError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/* At most a few requests in flight per site: polite to the job boards, and it stops one busy
   board (dozens of detail lookups) from starving its own other requests into timeouts. */
const PER_HOST = 4;
const hosts = new Map<string, { active: number; waiting: (() => void)[] }>();

async function withHostSlot<T>(host: string, run: () => Promise<T>): Promise<T> {
  let slot = hosts.get(host);
  if (!slot) hosts.set(host, (slot = { active: 0, waiting: [] }));
  if (slot.active >= PER_HOST) await new Promise<void>((resolve) => slot.waiting.push(resolve));
  else slot.active++;
  try {
    return await run();
  } finally {
    const next = slot.waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else slot.active--;
  }
}

/** GET JSON with a timeout (counted from when the request actually starts). Throws SourceError with a short reason. */
export async function getJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  let res: Response;
  try {
    res = await withHostSlot(new URL(url).host, () =>
      fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }),
    );
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(String((err as { cause?: { code?: string } }).cause?.code)));
    throw new SourceError(timedOut ? "timed out" : "couldn't connect");
  }
  if (res.status === 404) throw new SourceError("not found", 404);
  if (res.status === 429) throw new SourceError("rate limited", 429);
  if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError("unexpected response");
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "–", mdash: "—", bull: "•" };

export function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** HTML → readable plain text, capped (descriptions are only used for skill and experience matching). */
export function htmlToText(html: string | undefined | null, max = 8000): string {
  if (!html) return "";
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, max);
}

/** Run tasks with at most `limit` in flight. Results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* Small in-memory cache: job boards change slowly, and being polite matters more than freshness. */
const cache = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
  return value;
}
