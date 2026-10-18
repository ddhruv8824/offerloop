import { authMessage, formFields, goTo } from "@/lib/server/auth/redirects";
import { currentUser } from "@/lib/server/auth/session";
import { supabaseServer } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

/** Set a new password (after following a reset link, or from the account page). */
export async function POST(req: Request) {
  if (!(await currentUser())) return goTo(req, "/login");
  const f = await formFields(req);
  if ((f.password ?? "").length < 8) return goTo(req, "/auth/reset", { error: "Pick a password of at least 8 characters." });
  const { error } = await (await supabaseServer()).auth.updateUser({ password: f.password });
  if (error) return goTo(req, "/auth/reset", { error: authMessage(error) });
  return goTo(req, "/dashboard", { notice: "Password changed." });
}
