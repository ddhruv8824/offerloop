// Server only. Who may use this Offerloop: members. Signing in (Supabase) proves who you are;
// becoming a member takes an invite code (or open sign-up, or being an admin). Stored under
// the "accounts" namespace:
//
//   members/<user id>      one per person: email, role, when they joined, which code
//   invites                every invite code and how often it's been used
//   pending/<email hash>   a code entered at sign-up, waiting for the email to be confirmed

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { openStorage } from "@offerloop/storage";
import { adminEmails, signupMode } from "./config";

export interface Member {
  uid: string;
  email: string;
  role: "admin" | "member";
  joinedAt: string;
  invite?: string;
}

export interface InviteCode {
  code: string;
  note: string;
  /** 0 = unlimited. */
  maxUses: number;
  uses: number;
  createdAt: string;
  disabled?: boolean;
}

const dir = () => process.env.OFFERLOOP_DATA_DIR || process.env.JOBSWITCH_DATA_DIR || path.join(process.cwd(), ".data");
const storage = () => openStorage({ fileRoot: dir(), namespace: "accounts" });

const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
const normalCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

// Membership is checked on every API call: keep answers for a minute.
const g = globalThis as unknown as { __offerloopMembers?: Map<string, { at: number; member: Member | null }>; __offerloopInviteLock?: Promise<unknown> };
const cache = (g.__offerloopMembers ??= new Map());
const CACHE_MS = 60_000;

export async function getMember(uid: string): Promise<Member | null> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.member;
  const member = await storage().get<Member>(`members/${uid}`);
  cache.set(uid, { at: Date.now(), member });
  return member;
}

async function saveMember(member: Member): Promise<Member> {
  await storage().set(`members/${member.uid}`, member);
  cache.set(member.uid, { at: Date.now(), member });
  return member;
}

/** Invite codes from INVITE_CODES (comma-separated) always work and never run out. */
const envCodes = () =>
  (process.env.INVITE_CODES ?? "")
    .split(",")
    .map(normalCode)
    .filter(Boolean);

/** One change to the invites document at a time (uses are counted). */
function withInvites<T>(change: (codes: InviteCode[]) => T): Promise<T> {
  const run = async () => {
    const codes = (await storage().get<{ codes: InviteCode[] }>("invites"))?.codes ?? [];
    const result = change(codes);
    await storage().set("invites", { codes });
    return result;
  };
  const next = (g.__offerloopInviteLock ?? Promise.resolve()).then(run, run);
  g.__offerloopInviteLock = next.catch(() => undefined);
  return next;
}

/** Use one invite code. Returns why not, or null when it's been counted. */
async function useCode(raw: string): Promise<string | null> {
  const code = normalCode(raw);
  if (!code) return "Enter your invite code.";
  if (envCodes().includes(code)) return null;
  return withInvites((codes) => {
    const found = codes.find((c) => c.code === code);
    if (!found || found.disabled) return "That invite code isn't valid.";
    if (found.maxUses > 0 && found.uses >= found.maxUses) return "That invite code has been used up.";
    found.uses++;
    return null;
  });
}

/**
 * The member record for a signed-in user, creating it when they're allowed in without a code
 * (an admin email, open sign-up, or a code they entered when signing up). Null = needs a code.
 */
export async function ensureMember(user: { id: string; email: string }): Promise<Member | null> {
  const existing = await getMember(user.id);
  if (existing) return existing;
  const email = user.email.toLowerCase();
  const now = new Date().toISOString();
  if (adminEmails().includes(email)) {
    const member = await saveMember({ uid: user.id, email, role: "admin", joinedAt: now });
    // The first admin to sign in inherits the data from before accounts.
    await (await import("../legacy")).adoptLegacyData(user.id);
    return member;
  }
  if (signupMode() === "open") return saveMember({ uid: user.id, email, role: "member", joinedAt: now });
  const pending = await storage().get<{ code: string }>(`pending/${emailKey(email)}`);
  if (pending) {
    await storage().delete(`pending/${emailKey(email)}`);
    return saveMember({ uid: user.id, email, role: "member", joinedAt: now, invite: pending.code });
  }
  return null;
}

/** A signed-in person enters a code. Returns the member, or the reason it didn't work. */
export async function redeemInvite(user: { id: string; email: string }, code: string): Promise<Member | string> {
  const existing = await ensureMember(user);
  if (existing) return existing;
  const problem = await useCode(code);
  if (problem) return problem;
  return saveMember({ uid: user.id, email: user.email.toLowerCase(), role: "member", joinedAt: new Date().toISOString(), invite: normalCode(code) });
}

/**
 * At sign-up, before the account exists: check and use the code, and remember it for this
 * email so the first sign-in (after confirming the email, if that's on) makes them a member.
 */
export async function holdInviteForEmail(email: string, code: string): Promise<string | null> {
  if (signupMode() === "open" || adminEmails().includes(email.toLowerCase())) return null;
  const problem = await useCode(code);
  if (problem) return problem;
  await storage().set(`pending/${emailKey(email)}`, { code: normalCode(code), at: new Date().toISOString() });
  return null;
}

/* ── Admin ──────────────────────────────────────────────── */

export async function listInvites(): Promise<InviteCode[]> {
  return (await storage().get<{ codes: InviteCode[] }>("invites"))?.codes ?? [];
}

export function createInvite(note: string, maxUses: number): Promise<InviteCode> {
  const code = `OL-${randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})(.{4})/, "$1-$2")}`;
  const invite: InviteCode = { code, note: note.trim().slice(0, 80), maxUses: Math.max(0, Math.min(1000, Math.round(maxUses))), uses: 0, createdAt: new Date().toISOString() };
  return withInvites((codes) => {
    codes.unshift(invite);
    return invite;
  });
}

export function setInviteDisabled(code: string, disabled: boolean): Promise<boolean> {
  return withInvites((codes) => {
    const found = codes.find((c) => c.code === normalCode(code));
    if (found) found.disabled = disabled;
    return Boolean(found);
  });
}

export async function listMembers(): Promise<Member[]> {
  return (await storage().list<Member>("members/")).map((e) => e.value).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
}

/** Every member's id — the scheduler runs each one's workflows. */
export async function memberIds(): Promise<string[]> {
  return (await storage().keys("members/")).map((k) => k.slice("members/".length));
}
