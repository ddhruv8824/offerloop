// Server only. "Paste a link": turn one job URL into a FoundJob.
//
// Known job boards are read through their APIs. Any other site is fetched once and read
// from its schema.org JobPosting data (most career pages embed it for search engines).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FoundJob } from "@/lib/jobs";
import { withStatedSalary } from "./enrich";
import { decodeEntities, getJson, htmlToText, SourceError } from "./http";
import { ashby, greenhouse, lever, tidyLocation } from "./providers/ats";
import { hiristJob } from "./providers/hirist";
import { CANDIDATES, SOURCES, type Provider } from "./sources";

export class ImportError extends Error {}

/* ── Guard: the server must never fetch private or internal addresses for a user ── */

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new ImportError("Only https links are supported.");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new ImportError("That link isn't supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$|\.lan$/i.test(host)) throw new ImportError("That link isn't a public website.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new ImportError("Couldn't find that website.");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ImportError("That link isn't a public website.");
}

/** Fetch a public page as text: https only, redirects re-checked, size and time capped. */
async function fetchPublicHtml(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Offerloop/0.1 (reading one job posting for its user)" },
      cache: "no-store",
    }).catch(() => {
      throw new ImportError("Couldn't open that page.");
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new ImportError(res.status === 403 || res.status === 401 ? "That site doesn't allow automated reading. Add the job by hand in the Tracker instead." : `That page returned an error (${res.status}).`);
    if (!/html|xml/i.test(res.headers.get("content-type") ?? "")) throw new ImportError("That link isn't a web page.");
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 2_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel().catch(() => undefined);
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new ImportError("That link redirects too many times.");
}

/* ── schema.org JobPosting ───────────────────────────── */

type Json = Record<string, unknown>;

function findJobPosting(node: unknown): Json | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findJobPosting(item);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const obj = node as Json;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  return findJobPosting(obj["@graph"]);
}

const str = (v: unknown) => (typeof v === "string" ? decodeEntities(v).trim() : "");

function placeName(loc: unknown): string {
  const first = Array.isArray(loc) ? loc[0] : loc;
  const address = (first as Json | undefined)?.address as Json | string | undefined;
  if (typeof address === "string") return address;
  return [str(address?.addressLocality), str(address?.addressRegion), str(address?.addressCountry)].filter(Boolean).join(", ");
}

function fromHtml(html: string, url: URL): FoundJob {
  let posting: Json | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      posting = findJobPosting(JSON.parse(m[1].trim()));
    } catch {
      // malformed block — try the next one
    }
    if (posting) break;
  }
  const meta = (name: string) => str(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]);
  const pageTitle = meta("og:title") || str(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);

  // Without job data to read, only accept a page that at least looks like a job page —
  // otherwise any link at all would come back as a "job".
  const looksLikeJob = /job|career|hiring|opening|position|vacanc|apply|engineer|developer|analyst|designer|manager|intern\b/i.test(`${pageTitle} ${url.pathname}`);
  if (!posting && !(pageTitle && looksLikeJob)) {
    throw new ImportError("Couldn't find a job posting on that page. If it is one, add it by hand in the Tracker instead.");
  }

  const org = posting?.hiringOrganization as Json | string | undefined;
  const location = posting ? placeName(posting.jobLocation) : "";
  const remote = posting ? /TELECOMMUTE/i.test(String(posting.jobLocationType ?? "")) : false;
  return {
    id: `Link:${url.hostname}${url.pathname}`,
    source: "Link",
    company: (typeof org === "string" ? org : str(org?.name)) || meta("og:site_name") || url.hostname.replace(/^www\./, ""),
    title: str(posting?.title) || pageTitle,
    location: location || (remote ? "Remote" : "Not specified"),
    remote,
    url: url.toString(),
    postedAt: str(posting?.datePosted) || undefined,
    skills: [],
    description: posting ? htmlToText(str(posting.description)) : htmlToText(meta("og:description") || meta("description")),
  };
}

/* ── Router ──────────────────────────────────────────── */

/** Display name for a board id: the one we know, else the id tidied up ("acme-labs" → "Acme Labs"). */
function companyName(provider: Provider, id: string) {
  const known = [...SOURCES, ...CANDIDATES].find((s) => s.provider === provider && s.id.toLowerCase() === id.toLowerCase());
  return known?.name ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const orGone = (job: FoundJob | undefined | null): FoundJob => {
  if (!job) throw new ImportError("That posting isn't open any more.");
  return job;
};

/** Read one posting from its link, including any pay its description states. */
export async function importJob(rawUrl: string): Promise<FoundJob> {
  return withStatedSalary(await readJob(rawUrl));
}

async function readJob(rawUrl: string): Promise<FoundJob> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ImportError("That doesn't look like a link.");
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split("/").filter(Boolean);

  try {
    if (host === "hirist.tech" || host.endsWith(".hirist.tech")) {
      const id = url.pathname.match(/^\/j\/(?:.*-)?(\d+)\/?$/)?.[1];
      if (!id) throw new ImportError("Paste the link of one Hirist job (it ends in a number).");
      return orGone(await hiristJob(id));
    }
    if (host === "jobs.ashbyhq.com" && path.length >= 2) {
      return orGone((await ashby(path[0], companyName("ashby", path[0]))).find((j) => j.id.endsWith(`:${path[1]}`)));
    }
    if ((host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") && path[1] === "jobs" && path[2]) {
      return orGone((await greenhouse(path[0], companyName("greenhouse", path[0]))).find((j) => j.id.endsWith(`:${path[2]}`)));
    }
    if (host === "jobs.lever.co" && path.length >= 2) {
      return orGone((await lever(path[0], companyName("lever", path[0]))).find((j) => j.id.endsWith(`:${path[1]}`)));
    }
    if (host === "jobs.smartrecruiters.com" && path.length >= 2) {
      const id = path[1].match(/^\d+/)?.[0];
      if (id) {
        const d = await getJson<{ name: string; company?: { name?: string }; location?: { fullLocation?: string; city?: string; remote?: boolean }; releasedDate?: string; jobAd?: { sections?: Record<string, { text?: string } | undefined> } }>(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(path[0])}/postings/${id}`,
        );
        const s = d.jobAd?.sections ?? {};
        return {
          id: `SmartRecruiters:${path[0]}:${id}`,
          source: "SmartRecruiters",
          company: d.company?.name ?? path[0],
          title: d.name,
          location: tidyLocation(d.location?.fullLocation ?? d.location?.city ?? "") || "Not specified",
          remote: Boolean(d.location?.remote),
          url: url.toString(),
          postedAt: d.releasedDate,
          skills: [],
          description: htmlToText(`${s.jobDescription?.text ?? ""}\n${s.qualifications?.text ?? ""}`),
        };
      }
    }
  } catch (err) {
    if (err instanceof ImportError) throw err;
    if (err instanceof SourceError) throw new ImportError(err.status === 404 ? "That posting isn't open any more." : "Couldn't reach that job board right now. Try again in a minute.");
    throw err;
  }

  return fromHtml(await fetchPublicHtml(url), url);
}
