import { Logo } from "@/components/Logo";
import { Button, Card } from "@/components/ui";

export const metadata = { title: "Log in · Offerloop" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm p-6">
        <Logo href="/login" />
        <h1 className="mt-5 font-display text-xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-muted">This Offerloop is private. Enter the site password.</p>
        <form method="post" action="/api/login" className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next ?? ""} />
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-ink"
          />
          {error && <p className="text-sm text-danger">That password isn&apos;t right.</p>}
          <Button type="submit" className="w-full">
            Log in
          </Button>
        </form>
      </Card>
    </main>
  );
}
