// Server only. Which sign-in Offerloop uses, from the environment:
//
//   SUPABASE_URL + SUPABASE_ANON_KEY  → accounts (Supabase Auth): email + password and Google,
//                                        invite codes, one private space per person.
//   otherwise                          → one local user (development, or a private single-user
//                                        install), optionally behind APP_PASSWORD.

export const authMode = (): "accounts" | "single" => (supabaseConfig() ? "accounts" : "single");

export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  // Supabase calls it the "anon" key (legacy) or the "publishable" key (new); either works.
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
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
