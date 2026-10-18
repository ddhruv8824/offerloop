import type { EmailOtpType } from "@supabase/supabase-js";
import { authMessage, goTo, safeNext } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

/** Where Google sign-in and email links come back to: finish signing in, then carry on. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const next = safeNext(params.get("next"));
  const supabase = await supabaseServer();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: { message: params.get("error_description") ?? "That sign-in link didn't work." } };
  if (error) return goTo(req, "/login", { error: authMessage(error) });
  return goTo(req, type === "recovery" ? "/auth/reset" : next);
}
