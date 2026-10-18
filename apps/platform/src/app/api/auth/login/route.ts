import { authMode } from "@/lib/server/auth/config";
import { authMessage, formFields, goTo, safeNext } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

/** Email + password sign-in (form post from /login). */
export async function POST(req: Request) {
  const f = await formFields(req);
  const next = safeNext(f.next);
  if (authMode() !== "accounts") return goTo(req, "/login");
  const email = (f.email ?? "").trim();
  if (!email || !f.password) return goTo(req, "/login", { error: "Enter your email and password.", next, email });
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: f.password });
  if (error) return goTo(req, "/login", { error: authMessage(error), next, email });
  return goTo(req, next);
}
