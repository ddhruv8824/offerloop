// Server only. The docs: Markdown files in content/docs, each starting with a small header
//
//   ---
//   title: Getting started
//   description: One line for the page and search results.
//   order: 1
//   ---
//
// rendered to HTML with `marked`. The content is ours (in the repo), so the HTML is trusted.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  section: string;
  html: string;
  headings: { id: string; text: string }[];
}

const DIR = path.join(process.cwd(), "content", "docs");
const LEGAL = path.join(process.cwd(), "content", "legal");
const SLUG = /^[a-z0-9-]+$/;

/** Heading HTML → plain text ("doesn&#39;t" → "doesn't"). */
const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const slugify = (text: string) =>
  plainText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function parse(slug: string, raw: string): DocPage {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = match ? raw.slice(match[0].length) : raw;
  const headings: DocPage["headings"] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      // h2/h3 get ids (for links and the "On this page" list); external links open in a new tab.
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2) headings.push({ id, text: plainText(text) });
        return `<h${depth} id="${id}"><a href="#${id}">${text}</a></h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href);
        return `<a href="${href}"${title ? ` title="${title}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
    },
  });
  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? "",
    order: Number(meta.order ?? 99),
    section: meta.section ?? "Guides",
    html: marked.parse(body, { async: false }) as string,
    headings,
  };
}

export async function getDoc(slug: string): Promise<DocPage | null> {
  if (!SLUG.test(slug)) return null;
  try {
    return parse(slug, await readFile(path.join(DIR, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

/** Every page, in order, for the sidebar. */
export async function listDocs(): Promise<Pick<DocPage, "slug" | "title" | "description" | "order" | "section">[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".md"));
  const pages = await Promise.all(files.map(async (f) => parse(f.slice(0, -3), await readFile(path.join(DIR, f), "utf8"))));
  return pages
    .map(({ slug, title, description, order, section }) => ({ slug, title, description, order, section }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** A legal page (content/legal/<slug>.md): privacy, terms. */
export async function getLegal(slug: "privacy" | "terms"): Promise<DocPage | null> {
  try {
    const raw = await readFile(path.join(LEGAL, `${slug}.md`), "utf8");
    // {{contact}} and {{site}} come from the environment, so each install names its own operator.
    const contact = process.env.SUPPORT_EMAIL?.trim() || "the person who invited you to Offerloop";
    const site = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "this website").replace(/\/+$/, "");
    return parse(slug, raw.replaceAll("{{contact}}", contact).replaceAll("{{site}}", site));
  } catch {
    return null;
  }
}
