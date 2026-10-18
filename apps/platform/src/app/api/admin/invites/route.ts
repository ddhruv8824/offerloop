import { createInvite, setInviteDisabled } from "@/lib/server/auth/members";
import { formFields, goTo } from "@/lib/server/auth/redirects";
import { AuthError, requireAdmin } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Admin form posts: create a code ({ note, maxUses }) or turn one off/on ({ code, disable }). */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return goTo(req, "/dashboard");
    throw err;
  }
  const f = await formFields(req);
  if (f.code) {
    await setInviteDisabled(f.code, f.disable === "1");
    return goTo(req, "/admin");
  }
  const invite = await createInvite(f.note ?? "", Number(f.maxUses ?? 1) || 0);
  return goTo(req, "/admin", { created: invite.code });
}
