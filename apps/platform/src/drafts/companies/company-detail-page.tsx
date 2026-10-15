import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, MessagesSquare, Mic, Newspaper, PenLine, Sparkles, Users } from "lucide-react";
import { CompanyInsightsCard } from "@/components/CompanyInsightsCard";
import { CompanyDsaCard } from "@/components/dsa/CompanyDsaCard";
import { Badge, ButtonLink, Card, CardHeader, CompanyAvatar, EmptyState, ScoreRing } from "@/components/ui";
import { COMPANIES, getCompany, JOBS } from "@/lib/sample-data";
import { daysAgo } from "@/lib/utils";

export function generateStaticParams() {
  return COMPANIES.map((c) => ({ slug: c.slug }));
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = getCompany(slug);
  if (!company) notFound();
  const jobs = JOBS.filter((j) => j.companySlug === slug);

  return (
    <div>
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Companies
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <CompanyAvatar name={company.name} size={52} />
          <div>
            <h1 className="text-2xl font-semibold">{company.name}</h1>
            <p className="text-sm text-muted">
              {company.industry} · {company.city} · {company.size} employees
            </p>
          </div>
        </div>
        <ButtonLink href="/interview" variant="dark">
          <Mic className="size-4" /> Practice for {company.name}
        </ButtonLink>
      </div>

      {/* AI summary */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-ink px-5 py-3 text-sm font-semibold text-paper">
          <Sparkles className="size-4 text-coral" aria-hidden /> AI summary
          <span className="ml-auto text-xs font-normal text-paper/50">Updated daily</span>
        </div>
        <div className="grid gap-5 px-5 py-4 md:grid-cols-[1.4fr_1fr]">
          <p className="text-sm">{company.summary}</p>
          <ul className="space-y-2">
            {company.signals.map((s) => (
              <li key={s.text} className="flex items-start gap-2 text-sm">
                {s.tone === "good" ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Positive signal" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Watch out" />
                )}
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <CompanyInsightsCard company={company} />
      <CompanyDsaCard slug={company.slug} name={company.name} industry={company.industry} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Newspaper className="size-4" /> Latest news</span>} subtitle="Headlines link to the source" />
          {company.news.length ? (
            <ul className="divide-y divide-line">
              {company.news.map((n) => (
                <li key={n.title} className="px-5 py-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted">
                    {n.source} · {daysAgo(n.daysAgo)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Newspaper className="size-5" />} title="No recent news" />
          )}
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><MessagesSquare className="size-4" /> What people say</span>} subtitle="Public discussions" />
          {company.discussions.length ? (
            <ul className="divide-y divide-line">
              {company.discussions.map((d) => (
                <li key={d.title} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="text-sm">{d.title}</p>
                  <Badge>
                    {d.source} · {d.comments}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<MessagesSquare className="size-5" />} title="No discussions found yet" />
          )}
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Users className="size-4" /> Interview experiences</span>} subtitle="Shared by the community" />
          {company.interviewExperiences.length ? (
            <ul className="divide-y divide-line">
              {company.interviewExperiences.map((e) => (
                <li key={e.role + e.verdict} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{e.role}</p>
                    <Badge tone={e.verdict === "Offer" ? "success" : "neutral"}>{e.verdict}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{e.rounds}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Users className="size-5" />} title="No experiences yet">
              Interviewed here? Your notes help the next person.
            </EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><PenLine className="size-4" /> Engineering blog</span>} subtitle="Hints about their stack and interview topics" />
          {company.blogPosts.length ? (
            <ul className="divide-y divide-line">
              {company.blogPosts.map((p) => (
                <li key={p} className="px-5 py-3 text-sm">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<PenLine className="size-5" />} title="No blog found" />
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Open roles for you" />
        {jobs.length ? (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold">{j.title}</p>
                  <p className="text-xs text-muted">
                    {j.location} · via {j.source}
                  </p>
                </div>
                <ScoreRing score={j.matchScore} size={40} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Sparkles className="size-5" />} title="No open roles that match you right now" />
        )}
      </Card>
    </div>
  );
}
