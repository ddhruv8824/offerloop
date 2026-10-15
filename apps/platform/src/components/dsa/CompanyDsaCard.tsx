"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { companyList, domainForRole, domainList, useDsa } from "@/lib/dsa";
import { QuestionRow } from "./QuestionRow";

/** Top questions for one company on its page, linking to the full list in DSA Prep. */
export function CompanyDsaCard({ slug, name, industry }: { slug: string; name: string; industry: string }) {
  const dsa = useDsa();
  const list = companyList(slug, name) ?? domainList(/fin|bank|pay/i.test(industry) ? "fintech" : domainForRole());
  const top = [...list.items].sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0)).slice(0, 5);
  const solved = list.items.filter((i) => dsa?.status[i.question.slug] === "solved").length;
  const href = list.kind === "company" ? `/dsa?company=${slug}` : `/dsa?domain=${list.id.replace("domain:", "")}`;

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ListChecks className="size-4" /> {list.kind === "company" ? "Most-asked DSA questions" : `DSA questions · ${list.name}`}
          </span>
        }
        subtitle={`${solved}/${list.items.length} solved · opens on LeetCode`}
        action={
          <Link href={href} className="text-sm font-semibold text-coral-strong hover:underline">
            All {list.items.length}
          </Link>
        }
      />
      <ul className="divide-y divide-line">
        {top.map((item) => (
          <QuestionRow key={item.question.slug} item={item} status={dsa?.status[item.question.slug]} saved={dsa?.saved.includes(item.question.slug) ?? false} compact />
        ))}
      </ul>
    </Card>
  );
}
