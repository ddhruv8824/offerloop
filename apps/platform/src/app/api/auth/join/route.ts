import { redeemInvite } from "@/lib/server/auth/members";
import { formFields, goTo } from "@/lib/server/auth/redirects";
import { currentUser } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** A signed-in person without access enters an invite code (form post from /join). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return goTo(req, "/login", { next: "/join" });
  const f = await formFields(req);
  const result = await redeemInvite(user, f.code ?? "");
  if (typeof result === "string") return goTo(req, "/join", { error: result });
  return goTo(req, "/onboarding");
}
