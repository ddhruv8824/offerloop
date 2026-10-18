import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Divider, GoogleButton, inputClass, Notice } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import { authMode, signupMode } from "@/lib/server/auth/config";

export const metadata = { title: "Create your account · Offerloop" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; code?: string }> }) {
  if (authMode() !== "accounts") redirect("/login");
  const { error, email, code } = await searchParams;
  const invite = signupMode() === "invite";
  return (
    <AuthCard
      title="Create your account"
      subtitle={invite ? "Offerloop is invite-only for now. You need an invite code to join." : "Free while in early access."}
      footer={
        <>
          Have an account?{" "}
          <Link href="/login" className="font-semibold text-coral-strong hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Notice error={error} />
      <form method="post" action="/api/auth/signup" className="space-y-3">
        <input type="email" name="email" required autoComplete="email" defaultValue={email} aria-label="Email" placeholder="Email" className={inputClass} />
        <input type="password" name="password" required minLength={8} autoComplete="new-password" aria-label="Password" placeholder="Password (8+ characters)" className={inputClass} />
        {invite && <input name="code" required defaultValue={code} autoComplete="off" aria-label="Invite code" placeholder="Invite code, e.g. OL-1A2B-3C4D" className={`${inputClass} font-mono uppercase`} />}
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
      <Divider />
      <GoogleButton next="/join" />
      {invite && <p className="mt-2 text-center text-xs text-muted">With Google, you&apos;ll enter your invite code right after.</p>}
      <p className="mt-4 text-xs text-faint">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
