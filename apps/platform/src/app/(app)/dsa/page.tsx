"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Building2, Info, Layers, ListChecks } from "lucide-react";
import { BackFromLeetCode } from "@/components/dsa/BackFromLeetCode";
import { QuestionRow } from "@/components/dsa/QuestionRow";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  companyList,
  DOMAINS,
  domainForRole,
  domainList,
  QUESTION_BY_SLUG,
  useDsa,
  type Difficulty,
  type ListItem,
} from "@/lib/dsa";
import { useProfile } from "@/lib/profile";
import { COMPANIES } from "@/lib/sample-data";
import { useTracker } from "@/lib/tracker";
import { cn } from "@/lib/utils";

type Mode = "company" | "domain" | "mine";
const DIFFICULTIES: ("All" | Difficulty)[] = ["All", "Easy", "Medium", "Hard"];

interface CompanyOption {
  value: string; // "slug:<slug>" or "name:<name>"
  name: string;
  role?: string;
  tracked: boolean;
}

export default function DsaPrep() {
  const dsa = useDsa();
  const tracker = useTracker();
  const { profile } = useProfile();

  const [mode, setMode] = useState<Mode>("company");
  const [company, setCompany] = useState("slug:northwind-pay");
  const [domain, setDomain] = useState("must-know");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("All");
  const [topic, setTopic] = useState("All topics");
  const [hideSolved, setHideSolved] = useState(false);

  // Deep links: /dsa?company=<slug>, /dsa?domain=<id>, /dsa?list=mine
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("company")) {
      setMode("company");
      setCompany(`slug:${p.get("company")}`);
    } else if (p.get("domain")) {
      setMode("domain");
      setDomain(p.get("domain")!);
    } else if (p.get("list") === "mine") {
      setMode("mine");
    }
  }, []);

  useEffect(() => {
    if (profile && !new URLSearchParams(window.location.search).get("domain")) setDomain(domainForRole(profile.targetRole));
  }, [profile]);

  // Companies you track first, then every known company.
  const companyOptions = useMemo<CompanyOption[]>(() => {
    const opts: CompanyOption[] = [];
    const seen = new Set<string>();
    for (const card of tracker?.cards ?? []) {
      const value = card.companySlug ? `slug:${card.companySlug}` : `name:${card.company}`;
      if (seen.has(value)) continue;
      seen.add(value);
      opts.push({ value, name: card.company, role: card.title, tracked: true });
    }
    for (const c of COMPANIES) {
      const value = `slug:${c.slug}`;
      if (!seen.has(value)) opts.push({ value, name: c.name, tracked: false });
    }
    return opts;
  }, [tracker]);

  const selectedCompany = companyOptions.find((o) => o.value === company);

  const { list, notice } = useMemo(() => {
    if (mode === "domain") return { list: domainList(domain), notice: null };
    if (mode === "mine") {
      const items: ListItem[] = (dsa?.saved ?? []).map((slug) => QUESTION_BY_SLUG[slug]).filter(Boolean).map((question) => ({ question }));
      return { list: { id: "mine", name: "My list", kind: "domain" as const, sourceNote: "Questions you saved.", items }, notice: null };
    }
    const name = selectedCompany?.name ?? company.replace(/^(slug|name):/, "");
    const slug = company.startsWith("slug:") ? company.slice(5) : "";
    const found = slug ? companyList(slug, name) : null;
    if (found) return { list: found, notice: null };
    const fallback = domainList(domainForRole(selectedCompany?.role ?? profile?.targetRole));
    return { list: fallback, notice: `No question list for ${name} yet — showing the ${fallback.name} list for this kind of role.` };
  }, [mode, domain, company, selectedCompany, dsa?.saved, profile?.targetRole]);

  const topics = useMemo(() => ["All topics", ...new Set(list.items.flatMap((i) => i.question.topics))], [list]);

  const items = list.items
    .filter((i) => difficulty === "All" || i.question.difficulty === difficulty)
    .filter((i) => topic === "All topics" || i.question.topics.includes(topic))
    .filter((i) => !hideSolved || dsa?.status[i.question.slug] !== "solved")
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

  const solved = list.items.filter((i) => dsa?.status[i.question.slug] === "solved").length;
  const revisit = list.items.filter((i) => dsa?.status[i.question.slug] === "revisit").length;
  const pct = list.items.length ? Math.round((solved / list.items.length) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="DSA Prep"
        description="The most-asked LeetCode questions for the companies you're targeting. Questions open on LeetCode; your progress stays here."
      />

      <BackFromLeetCode />

      {/* Source */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1" role="tablist" aria-label="Question source">
          {(
            [
              ["company", "By company", Building2],
              ["domain", "By domain", Layers],
              ["mine", `My list${dsa?.saved.length ? ` · ${dsa.saved.length}` : ""}`, Bookmark],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                mode === id ? "bg-paper font-semibold text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>

        {mode === "company" && (
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-md border border-line bg-paper px-3 py-2 text-sm lg:min-w-64"
            aria-label="Company"
          >
            {companyOptions.some((o) => o.tracked) && (
              <optgroup label="In your tracker">
                {companyOptions
                  .filter((o) => o.tracked)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {companyOptions.some((o) => !o.tracked) && (
              <optgroup label="All companies">
                {companyOptions
                  .filter((o) => !o.tracked)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        )}

        {mode === "domain" && (
          <div className="flex flex-wrap gap-1.5">
            {DOMAINS.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={domain === d.id}
                onClick={() => setDomain(d.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  domain === d.id ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-faint",
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <p className="mb-4 flex items-start gap-2 rounded-md bg-info-wash px-3 py-2 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {notice}
        </p>
      )}

      {/* Progress */}
      <Card className="mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-semibold">{list.name}</p>
          <div className="mt-2 h-2 rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Solved">
            <div className="h-2 rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted">Solved</dt>
            <dd className="font-display text-lg font-semibold">
              {solved}/{list.items.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Revisit</dt>
            <dd className="font-display text-lg font-semibold">{revisit}</dd>
          </div>
        </dl>
      </Card>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn("rounded-md px-3 py-1.5 text-sm", difficulty === d ? "bg-ink text-paper" : "text-muted hover:bg-ink/5")}
            >
              {d}
            </button>
          ))}
        </div>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm" aria-label="Topic">
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={hideSolved} onChange={(e) => setHideSolved(e.target.checked)} className="accent-[var(--color-coral)]" />
          Hide solved
        </label>
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<ListChecks className="size-5" />} title={mode === "mine" && !dsa?.saved.length ? "Your list is empty" : "No questions match"}>
            {mode === "mine" && !dsa?.saved.length ? "Save questions with the bookmark icon to build your own list." : "Try another difficulty or topic."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <QuestionRow key={item.question.slug} item={item} status={dsa?.status[item.question.slug]} saved={dsa?.saved.includes(item.question.slug) ?? false} />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        {list.sourceNote} Each question opens on leetcode.com in a new tab — LeetCode doesn&apos;t allow being shown inside other sites.
      </p>
    </div>
  );
}
