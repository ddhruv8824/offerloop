import { notFound } from "next/navigation";
import { readTailoredVersion } from "@offerloop/resume-studio/server";
import { TailoredReview, type ReviewItem } from "@/components/automations/TailoredReview";
import { requirePageMember } from "@/lib/server/auth/gate";
import { readStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** The resumes one automation run tailored, each next to the job description it was tailored to. */
export default async function TailoredResumesPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const account = await requirePageMember(`/automations/runs/${runId}/resumes`);
  const run = (await readStore(account.id)).runs.find((r) => r.id === runId);
  if (!run) notFound();

  const items: ReviewItem[] = await Promise.all(
    (run.tailored ?? []).map(async (t) => {
      const saved = t.status === "done" && t.versionId ? await readTailoredVersion(account.id, t.versionId).catch(() => null) : null;
      return {
        ...t,
        jdText: saved?.version.jd_text ?? null,
        resume: saved?.resume ?? null,
        edits: saved?.version.changes ?? [],
        review: saved?.version.review ?? null,
        gaps: (saved?.version.gaps ?? []).map((g) => g.skill),
        mustHave: saved?.version.jd_analysis?.must_have_skills ?? [],
        missingVersion: t.status === "done" && !saved,
      };
    }),
  );

  return <TailoredReview runName={run.workflowName} startedAt={run.startedAt} items={items} />;
}
