import { redirect } from "next/navigation";
import { AuthCard, inputClass, Notice } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import { currentUser } from "@/lib/server/auth/session";

export const metadata = { title: "Set a new password · Offerloop" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await currentUser())) redirect("/login?error=" + encodeURIComponent("That reset link has expired. Ask for a new one."));
  const { error } = await searchParams;
  return (
    <AuthCard title="Set a new password">
      <Notice error={error} />
      <form method="post" action="/api/auth/reset" className="space-y-3">
        <input type="password" name="password" required minLength={8} autoFocus autoComplete="new-password" aria-label="New password" placeholder="New password (8+ characters)" className={inputClass} />
        <Button type="submit" className="w-full">
          Save password
        </Button>
      </form>
    </AuthCard>
  );
}
