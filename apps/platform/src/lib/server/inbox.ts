// Server only: imported by the /api/inbox route handlers, never by client components.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { classifyEmail, gmailQuery, type EmailClassification } from "@/lib/email-classifier";

/**
 * Gmail connection for the tracker. Read-only scope; the refresh token lives
 * in an encrypted, httpOnly cookie in the user's own browser (no database yet).
 * Scans return only the classification and headers — never the email body.
 */

export const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const TOKEN_COOKIE = "js_inbox";
export const STATE_COOKIE = "js_inbox_state";

const env = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  secret: process.env.INBOX_SECRET ?? "",
});

export function isConfigured() {
  const e = env();
  return Boolean(e.clientId && e.clientSecret && e.secret.length >= 16);
}

export function redirectUri(origin: string) {
  return `${origin}/api/inbox/google/callback`;
}

/* ── Encrypted cookie ─────────────────────────────────── */

export interface StoredInbox {
  refreshToken: string;
  email: string;
}

function key() {
  return createHash("sha256").update(env().secret).digest();
}

export function seal(data: StoredInbox): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(value: string | undefined): StoredInbox | null {
  if (!value || !isConfigured()) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as StoredInbox;
  } catch {
    return null; // tampered, or INBOX_SECRET changed
  }
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});

/* ── Google OAuth ─────────────────────────────────────── */

export function authUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: env().clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: `openid email ${SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env().clientId, client_secret: env().clientSecret, ...params }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new Error(json.error_description || json.error || `Google token error ${res.status}`);
  return json;
}

export async function exchangeCode(code: string, origin: string) {
  const json = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!json.refresh_token) throw new Error("Google didn't return a refresh token. Remove Offerloop from your Google account's third-party access and connect again.");
  const profile = await gmail<{ emailAddress: string }>("/profile", json.access_token);
  return { refreshToken: json.refresh_token, email: profile.emailAddress };
}

export async function accessToken(refreshToken: string) {
  const json = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return json.access_token;
}

export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

/* ── Gmail ────────────────────────────────────────────── */

async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail error ${res.status}`);
  return (await res.json()) as T;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  internalDate: string;
  snippet: string;
  payload: GmailPart;
}

function decode(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

/** Plain text of a message: text/plain if present, else stripped HTML. Capped — only used for classifying. */
function bodyText(part: GmailPart): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType === "text/plain") plain.push(decode(p.body?.data));
    else if (p.mimeType === "text/html") html.push(decode(p.body?.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  const text = plain.join("\n") || html.join("\n").replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return text.slice(0, 6000);
}

export interface Detection extends EmailClassification {
  messageId: string;
  date: string;
  from: string;
  subject: string;
}

export interface ScanEmail {
  id: string;
  date: string;
  from: string;
  subject: string;
  body: string;
}

export function classifyAll(emails: ScanEmail[]): Detection[] {
  return emails
    .map((e) => {
      const c = classifyEmail(e.subject, e.body);
      return c ? { ...c, messageId: e.id, date: e.date, from: e.from, subject: e.subject } : null;
    })
    .filter((d): d is Detection => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function scanGmail(refreshToken: string, companies: string[], days: number, skip: Set<string>) {
  const token = await accessToken(refreshToken);
  const q = gmailQuery(companies, days);
  const list = await gmail<{ messages?: { id: string }[] }>(`/messages?maxResults=40&q=${encodeURIComponent(q)}`, token);
  const ids = (list.messages ?? []).map((m) => m.id).filter((id) => !skip.has(id));

  const emails: ScanEmail[] = [];
  for (const id of ids) {
    const msg = await gmail<GmailMessage>(`/messages/${id}?format=full`, token);
    const header = (name: string) => msg.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    emails.push({
      id,
      date: new Date(Number(msg.internalDate)).toISOString(),
      from: header("from"),
      subject: header("subject"),
      body: bodyText(msg.payload) || msg.snippet,
    });
  }
  return { checked: ids.length, checkedIds: ids, detections: classifyAll(emails) };
}

/* ── Sample inbox (development only, for trying the flow without Google) ── */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const SAMPLE_EMAILS: ScanEmail[] = [
  {
    id: "sample-1",
    date: daysAgo(9),
    from: "Lumen Health Careers <no-reply@lumen-health.example>",
    subject: "Thank you for applying to Lumen Health",
    body: "Hi, we have received your application for Software Engineer, Web Platform. Our team will review it shortly.",
  },
  {
    id: "sample-2",
    date: daysAgo(2),
    from: "Lumen Health Recruiting <talent@lumen-health.example>",
    subject: "Next steps for Software Engineer, Web Platform",
    body: "We'd love to move you forward. Please complete the online assessment on HackerRank within 3 days.",
  },
  {
    id: "sample-3",
    date: daysAgo(1),
    from: "Orbit Logistics via Hirist <alerts@hirist.example>",
    subject: "Update on your application: UI Engineer",
    body: "Thank you for your interest. Unfortunately, we have decided to move forward with other candidates for this role.",
  },
  {
    id: "sample-4",
    date: daysAgo(1),
    from: "Talent Team <jobs@unknown-startup.example>",
    subject: "Quick question",
    body: "Unfortunately we couldn't open the portfolio link you shared. Could you send it again?",
  },
  {
    id: "sample-5",
    date: daysAgo(3),
    from: "Weekly Tech Digest <news@digest.example>",
    subject: "5 articles for your week",
    body: "Here are the stories we think you'll like.",
  },
];
