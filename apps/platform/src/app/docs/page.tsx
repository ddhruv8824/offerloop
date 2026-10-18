import { notFound } from "next/navigation";
import { getDoc } from "@/lib/server/docs";
import { DocArticle } from "./DocArticle";

export const dynamic = "force-static";

export default async function DocsHome() {
  const doc = await getDoc("index");
  if (!doc) notFound();
  return <DocArticle doc={doc} />;
}
