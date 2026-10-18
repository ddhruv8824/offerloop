import { redirect } from "next/navigation";
import { AuthCard, inputClass, Notice } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import { ensureMember } from "@/lib/server/auth/members";
import { currentUser } from "@/lib/server/auth/session";

export const metadata = { title: "Enter your invite code · Offerloop" };
export const dynamic = "force-dynamic";

/** Signed in (e.g. with Google) but not a member yet: enter an invite code. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/join");
  if (await ensureMember(user)) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <AuthCard
      title="One more step"
      subtitle={
        <>
          You&apos;re signed in as <b>{user.email}</b>. Offerloop is invite-only for now — enter your invite code to start.
        </>
      }
      footer={
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="hover:underline">
            Use a different account
          </button>
        </form>
      }
    >
      <Notice error={error} />
      <form method="post" action="/api/auth/join" className="space-y-3">
        <input name="code" required autoFocus autoComplete="off" aria-label="Invite code" placeholder="Invite code, e.g. OL-1A2B-3C4D" className={`${inputClass} font-mono uppercase placeholder:font-sans placeholder:normal-case`} />
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted">No code? Ask the person who told you about Offerloop.</p>
    </AuthCard>
  );
}
