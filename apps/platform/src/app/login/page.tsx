import Link from "next/link";
import { AuthCard, Divider, GoogleButton, inputClass, Notice } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import { authMode } from "@/lib/server/auth/config";
import { safeNext } from "@/lib/server/auth/redirects";

export const metadata = { title: "Log in · Offerloop" };
export const dynamic = "force-dynamic";

type Params = { next?: string; error?: string; notice?: string; email?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { next: rawNext, error, notice, email } = await searchParams;
  const next = safeNext(rawNext);

  if (authMode() === "single") {
    // A private single-user install: one site password (APP_PASSWORD).
    return (
      <AuthCard title="Log in" subtitle="This Offerloop is private. Enter the site password.">
        <form method="post" action="/api/login" className="space-y-3">
          <input type="hidden" name="next" value={rawNext ?? ""} />
          <input type="password" name="password" required autoFocus autoComplete="current-password" aria-label="Password" placeholder="Password" className={inputClass} />
          {error && <p className="text-sm text-danger">That password isn&apos;t right.</p>}
          <Button type="submit" className="w-full">
            Log in
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-coral-strong hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Notice error={error} notice={notice} />
      <GoogleButton next={next} />
      <Divider />
      <form method="post" action="/api/auth/login" className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <input type="email" name="email" required autoComplete="email" defaultValue={email} aria-label="Email" placeholder="Email" className={inputClass} />
        <input type="password" name="password" required autoComplete="current-password" aria-label="Password" placeholder="Password" className={inputClass} />
        <Button type="submit" className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-3 text-right text-xs">
        <Link href="/forgot" className="text-muted hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
