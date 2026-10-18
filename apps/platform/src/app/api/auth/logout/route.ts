import { authMode } from "@/lib/server/auth/config";
import { goTo } from "@/lib/server/auth/redirects";
import { supabaseServer } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (authMode() === "accounts") await (await supabaseServer()).auth.signOut();
  return goTo(req, "/");
}
