import { authMode } from "@/lib/server/auth/config";
import { authMessage, goTo, safeNext } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";
import { publicUrl } from "@/lib/server/public-url";

export const dynamic = "force-dynamic";

/** "Continue with Google": off to Google, back at /auth/callback. */
export async function GET(req: Request) {
  if (authMode() !== "accounts") return goTo(req, "/login");
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const callback = publicUrl(req, "/auth/callback");
  callback.searchParams.set("next", next);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
  if (error || !data.url) return goTo(req, "/login", { error: error ? authMessage(error) : "Google sign-in isn't set up yet." });
  return Response.redirect(data.url, 303);
}
