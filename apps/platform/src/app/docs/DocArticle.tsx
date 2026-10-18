import type { DocPage } from "@/lib/server/docs";

/** One rendered docs page, with an "On this page" list. */
export function DocArticle({ doc }: { doc: DocPage }) {
  return (
    <article>
      <h1 className="font-display text-3xl font-semibold">{doc.title}</h1>
      {doc.description && <p className="mt-2 text-base text-muted">{doc.description}</p>}
      {doc.headings.length > 2 && (
        <nav aria-label="On this page" className="mt-5 rounded-md border border-line bg-paper p-4 text-sm">
          <p className="mb-2 text-xs font-semibold tracking-widest text-faint uppercase">On this page</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {doc.headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="text-coral-strong hover:underline">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="doc-content mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  );
}
