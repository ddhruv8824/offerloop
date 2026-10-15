import { UserRound } from "lucide-react";
import { SampleProfileButton } from "./SampleProfileButton";
import { ButtonLink, Card } from "./ui";

/** Shown in place of content that needs the career profile. Never a redirect. */
export function ProfilePrompt({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-coral-wash text-coral-strong">
        <UserRound className="size-5" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/onboarding">Set up profile · 2 min</ButtonLink>
        <SampleProfileButton label="Use a sample" stay />
      </div>
    </Card>
  );
}
