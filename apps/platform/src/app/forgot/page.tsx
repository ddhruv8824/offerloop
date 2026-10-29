import Link from "next/link";
import { AuthCard, inputClass, Notice } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import { withBase } from "@/lib/base-path";

export const metadata = { title: "Reset your password · Offerloop" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email } = await searchParams;
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link href="/login" className="hover:underline">
          Back to log in
        </Link>
      }
    >
      <Notice error={error} />
      <form method="post" action={withBase("/api/auth/forgot")} className="space-y-3">
        <input type="email" name="email" required autoComplete="email" defaultValue={email} aria-label="Email" placeholder="Email" className={inputClass} />
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted">Signed up with Google? Just use &quot;Continue with Google&quot; — there&apos;s no password to reset.</p>
    </AuthCard>
  );
}
