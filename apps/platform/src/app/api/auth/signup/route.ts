import { authMode, signupMode } from "@/lib/server/auth/config";
import { holdInviteForEmail } from "@/lib/server/auth/members";
import { authMessage, formFields, goTo } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";
import { publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

/** Create an account: email, password and (unless sign-up is open) an invite code. */
export async function POST(req: Request) {
  if (authMode() !== "accounts") return goTo(req, "/login");
  const f = await formFields(req);
  const email = (f.email ?? "").trim().toLowerCase();
  const back = (error: string) => goTo(req, "/signup", { error, email, code: f.code });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back("Enter a valid email.");
  if ((f.password ?? "").length < 8) return back("Pick a password of at least 8 characters.");
  if (signupMode() === "invite" && !(f.code ?? "").trim()) return back("Enter your invite code.");

  // Check (and count) the code before creating the account, and remember it for this email.
  const problem = await holdInviteForEmail(email, f.code ?? "");
  if (problem) return back(problem);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: f.password,
    options: { emailRedirectTo: publicUrl(req, "/auth/callback").toString() },
  });
  if (error) return back(authMessage(error));
  // Supabase answers an existing email with a user that has no identities (to not reveal it).
  if (data.user && data.user.identities?.length === 0) return back("There's already an account with this email. Log in instead.");
  // With "Confirm email" off in Supabase, you're signed in straight away.
  if (data.session) return goTo(req, "/onboarding");
  return goTo(req, "/login", { notice: "Check your inbox and confirm your email, then log in.", email });
}

