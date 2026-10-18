import { AppShell } from "@/components/AppShell";
import { requirePageMember } from "@/lib/server/auth/gate";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const account = await requirePageMember("/dashboard");
  return <AppShell account={account}>{children}</AppShell>;
}
