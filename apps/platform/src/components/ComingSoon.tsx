import { ArrowRight } from "lucide-react";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getTool } from "@/lib/tools";

/**
 * Page for a tool that is announced but not part of the launch. The tool's earlier
 * screens are kept in src/drafts until work on it resumes.
 */
export function ComingSoon({ toolId, meanwhile }: { toolId: string; meanwhile: { label: string; href: string; text: string } }) {
  const tool = getTool(toolId);
  const Icon = tool.icon;
  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-lg bg-coral-wash text-coral-strong">
        <Icon className="size-6" aria-hidden />
      </span>
      <Badge className="mt-4">Coming soon</Badge>
      <h1 className="mt-3 text-2xl font-semibold">{tool.name}</h1>
      <p className="mt-2 text-sm text-muted">{tool.tagline}. We&apos;re still building it.</p>
      <p className="mt-6 text-sm text-text/80">{meanwhile.text}</p>
      <ButtonLink href={meanwhile.href} className="mt-4">
        {meanwhile.label} <ArrowRight className="size-3.5" />
      </ButtonLink>
    </Card>
  );
}
