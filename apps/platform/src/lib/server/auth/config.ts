// Server only. Which sign-in Offerloop uses, from the environment:
//
//   SUPABASE_URL + SUPABASE_ANON_KEY  → accounts (Supabase Auth): email + password and Google,
//                                        invite codes, one private space per person.
//   otherwise                          → one local user (development, or a private single-user
//                                        install), optionally behind APP_PASSWORD.

export const authMode = (): "accounts" | "single" => (supabaseConfig() ? "accounts" : "single");

export function supabaseConfig(): { url: string; key: string } | null {
  const env = process.env;
  // Also accepts the NEXT_PUBLIC_ names Supabase's "Connect" page suggests.
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, "");
  // Supabase calls it the "anon" key (legacy) or the "publishable" key (new); either works.
  const key = (
    env.SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  return url && key ? { url, key } : null;
}

/** The one user of a single-user install. */
export const LOCAL_USER = { id: "local", email: "you@localhost" } as const;

/** Emails that are admins (manage invites; their first sign-in inherits the pre-accounts data). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** "invite" (default): new people need an invite code. "open": anyone can join. */
export const signupMode = (): "invite" | "open" => (process.env.SIGNUP_MODE?.trim().toLowerCase() === "open" ? "open" : "invite");
