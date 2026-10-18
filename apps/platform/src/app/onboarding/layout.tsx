import { SyncGate } from "@/components/SyncGate";
import { requirePageMember } from "@/lib/server/auth/gate";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const account = await requirePageMember("/onboarding");
  return <SyncGate accountId={account.id}>{children}</SyncGate>;
}
