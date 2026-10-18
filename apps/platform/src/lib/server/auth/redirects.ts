// Server only. Redirect helpers for the sign-in forms (plain HTML form posts, so they work
// without JavaScript).
import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/server/public-url";

/** Only paths on this site: "/dashboard", never "//evil.com" or "https://…". */
export function safeNext(raw: unknown, fallback = "/dashboard"): string {
  const next = typeof raw === "string" ? raw.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** 303 to a page on this site, with optional query params (e.g. an error to show). */
export function goTo(req: Request, path: string, params: Record<string, string | undefined> = {}) {
  const url = publicUrl(req, path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

/** Form fields as strings. */
export async function formFields(req: Request): Promise<Record<string, string>> {
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  form?.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/** Supabase's error messages, said plainly. */
export function authMessage(err: { message?: string; code?: string } | null | undefined): string {
  const m = (err?.message ?? "").toLowerCase();
  if (/invalid login credentials/.test(m)) return "That email and password don't match.";
  if (/email not confirmed/.test(m)) return "Confirm your email first — check your inbox for the link.";
  if (/already registered|already exists/.test(m)) return "There's already an account with this email. Log in instead.";
  if (/password.*(at least|short|weak)/.test(m)) return "Pick a longer password (at least 8 characters).";
  if (/rate limit|too many/.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/signups not allowed|signup is disabled/.test(m)) return "Sign-up is closed in Supabase. Turn on \"Allow new users to sign up\".";
  return err?.message || "That didn't work. Try again.";
}
