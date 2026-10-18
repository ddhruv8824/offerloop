import { authMode } from "@/lib/server/auth/config";
import { authMessage, formFields, goTo } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";
import { publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

/** Send a password-reset email (needs email sending set up in Supabase). */
export async function POST(req: Request) {
  if (authMode() !== "accounts") return goTo(req, "/login");
  const email = ((await formFields(req)).email ?? "").trim();
  if (!email) return goTo(req, "/forgot", { error: "Enter your email." });
  const supabase = await supabaseServer();
  const redirectTo = publicUrl(req, "/auth/callback");
  redirectTo.searchParams.set("next", "/auth/reset");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.toString() });
  if (error) return goTo(req, "/forgot", { error: authMessage(error), email });
  // Same answer whether or not the email has an account.
  return goTo(req, "/login", { notice: "If that email has an account, a reset link is on its way.", email });
}
