"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Section = { section: string; pages: { slug: string; title: string }[] };

/** The docs sidebar; on phones it folds into a "Contents" menu. */
export function DocsNav({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  const href = (slug: string) => (slug === "index" ? "/docs" : `/docs/${slug}`);
  const list = (
    <nav aria-label="Docs" className="space-y-5 text-sm">
      {sections.map(({ section, pages }) => (
        <div key={section}>
          <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-faint uppercase">{section}</p>
          <ul className="space-y-0.5">
            {pages.map((p) => {
              const active = pathname === href(p.slug);
              return (
                <li key={p.slug}>
                  <Link
                    href={href(p.slug)}
                    aria-current={active ? "page" : undefined}
                    className={cn("block rounded-md px-2 py-1.5", active ? "bg-coral-wash font-semibold text-coral-strong" : "text-muted hover:bg-ink/5 hover:text-text")}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <details className="rounded-md border border-line bg-paper p-3 lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold">Contents</summary>
        <div className="mt-3">{list}</div>
      </details>
      <aside className="sticky top-20 hidden self-start lg:block">{list}</aside>
    </>
  );
}
