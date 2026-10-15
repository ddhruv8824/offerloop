import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Card, CompanyAvatar, ModuleBanner, PageHeader } from "@/components/ui";
import { COMPANIES, JOBS } from "@/lib/sample-data";
import { getTool } from "@/lib/tools";

export default function Companies() {
  const tool = getTool("companies");
  return (
    <div>
      <PageHeader title="Companies" description="Everything about a company on one page: news, what people say, hiring signals and interview experiences." />
      <ModuleBanner status={tool.status}>
        Sample companies. Next: daily news from Google News RSS and Hacker News, plus open-role trends from the job connectors.
      </ModuleBanner>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMPANIES.map((c) => {
          const openRoles = JOBS.filter((j) => j.companySlug === c.slug).length;
          return (
            <Link key={c.slug} href={`/companies/${c.slug}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-faint">
                <div className="flex items-center gap-3">
                  <CompanyAvatar name={c.name} size={40} />
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted">
                      {c.industry} · {c.city}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {c.signals.slice(0, 2).map((s) => (
                    <li key={s.text} className="flex items-start gap-2 text-xs">
                      {s.tone === "good" ? (
                        <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-label="Positive signal" />
                      ) : (
                        <CircleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-label="Watch out" />
                      )}
                      {s.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs font-semibold text-coral-strong">
                  {openRoles} open {openRoles === 1 ? "role" : "roles"} for you →
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
