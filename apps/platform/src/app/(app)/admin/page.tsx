import { redirect } from "next/navigation";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { authMode, signupMode } from "@/lib/server/auth/config";
import { listInvites, listMembers } from "@/lib/server/auth/members";
import { requireMember } from "@/lib/server/auth/session";

export const metadata = { title: "Admin · Offerloop" };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Invite codes and members. Admins only (ADMIN_EMAILS). */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await requireMember().catch(() => null);
  if (!me || me.role !== "admin" || authMode() !== "accounts") redirect("/dashboard");
  const [{ created }, invites, members] = await Promise.all([searchParams, listInvites(), listMembers()]);

  return (
    <div>
      <PageHeader
        title="Admin"
        description={
          signupMode() === "open"
            ? "Sign-up is open to everyone (SIGNUP_MODE=open). Invite codes still work but aren't needed."
            : "Sign-up is invite-only. Make a code, send it to someone, and they can create an account with it."
        }
      />

      <Card className="mb-8">
        <CardHeader title="Invite codes" subtitle="One code per person (or a few uses for a group). Turn a code off any time; people who joined with it stay." />
        <div className="space-y-4 px-5 py-4">
          {created && (
            <p className="rounded-md bg-success-wash px-3 py-2 text-sm text-success">
              New code: <b className="font-mono select-all">{created}</b> — send it with the sign-up link: <span className="select-all">/signup</span>
            </p>
          )}
          <form method="post" action="/api/admin/invites" className="flex flex-col gap-2 sm:flex-row">
            <input name="note" placeholder="Who it's for (just for you), e.g. Priya from college" className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-muted">
              Uses
              <input name="maxUses" type="number" min={0} max={1000} defaultValue={1} className="w-20 rounded-md border border-line bg-paper px-2 py-2 text-sm" title="0 = unlimited" />
            </label>
            <Button type="submit">Create code</Button>
          </form>
          {invites.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {invites.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-mono font-semibold select-all">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{c.note || "—"}</span>
                  <span className="text-xs text-muted">
                    {c.uses}/{c.maxUses || "∞"} used · {day(c.createdAt)}
                  </span>
                  {c.disabled && <Badge tone="neutral">Off</Badge>}
                  <form method="post" action="/api/admin/invites">
                    <input type="hidden" name="code" value={c.code} />
                    <input type="hidden" name="disable" value={c.disabled ? "0" : "1"} />
                    <button type="submit" className="text-xs font-semibold text-coral-strong hover:underline">
                      {c.disabled ? "Turn on" : "Turn off"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Members (${members.length})`} subtitle="Everyone with access. Remove someone's sign-in in Supabase → Authentication → Users." />
        <ul className="divide-y divide-line text-sm">
          {members.map((m) => (
            <li key={m.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate font-semibold">{m.email}</span>
              {m.role === "admin" && <Badge tone="coral">Admin</Badge>}
              <span className="font-mono text-xs text-muted">{m.invite ?? ""}</span>
              <span className="text-xs text-muted">joined {day(m.joinedAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
