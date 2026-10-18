import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDoc, listDocs } from "@/lib/server/docs";
import { DocArticle } from "../DocArticle";

export async function generateStaticParams() {
  return (await listDocs()).filter((d) => d.slug !== "index").map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = await getDoc((await params).slug);
  return doc ? { title: doc.title, description: doc.description } : {};
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "index") notFound();
  const doc = await getDoc(slug);
  if (!doc) notFound();
  return <DocArticle doc={doc} />;
}
