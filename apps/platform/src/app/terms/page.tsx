import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getLegal } from "@/lib/server/docs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms of use · Offerloop" };

export default async function Page() {
  const doc = await getLegal("terms");
  if (!doc) notFound();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-8">
          <Logo />
          <Link href="/docs" className="ml-auto text-sm text-muted hover:text-text">
            Docs
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="font-display text-3xl font-semibold">{doc.title}</h1>
        {doc.description && <p className="mt-2 text-sm text-muted">{doc.description}</p>}
        <div className="doc-content mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </main>
    </div>
  );
}
