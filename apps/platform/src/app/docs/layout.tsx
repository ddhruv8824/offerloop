import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";
import { listDocs } from "@/lib/server/docs";
import { DocsNav } from "./DocsNav";

export const metadata = { title: { default: "Docs · Offerloop", template: "%s · Offerloop docs" } };

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const pages = await listDocs();
  const sections = [...new Set(pages.map((p) => p.section))].map((section) => ({ section, pages: pages.filter((p) => p.section === section) }));
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-8">
          <Logo />
          <Link href="/docs" className="text-sm font-semibold text-muted hover:text-text">
            Docs
          </Link>
          <ButtonLink href="/dashboard" className="ml-auto px-3 py-1.5 text-sm">
            Open Offerloop
          </ButtonLink>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <DocsNav sections={sections} />
        <main className="min-w-0">{children}</main>
      </div>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 border-t border-line px-4 py-6 text-sm text-muted sm:px-8">
        <Link href="/" className="hover:text-text">
          Home
        </Link>
        <Link href="/privacy" className="hover:text-text">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-text">
          Terms
        </Link>
      </footer>
    </div>
  );
}
