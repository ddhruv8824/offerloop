"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { ProfilePrompt } from "@/components/ProfilePrompt";
import { Badge, Button, ButtonLink, Card, CardHeader, PageHeader, SkillChip } from "@/components/ui";
import { clearProfile, useProfile } from "@/lib/profile";
import { TOOLS } from "@/lib/tools";

export default function Profile() {
  const { profile } = useProfile();
  const router = useRouter();
  if (!profile) {
    return (
      <div>
        <PageHeader title="Career Profile" description="Optional. Tools work without it — with it, they pre-fill your role, skills and resume for you." />
        <ProfilePrompt title="You haven't set up a profile">Set one up once and every tool can reuse it.</ProfilePrompt>
      </div>
    );
  }

  const readers = TOOLS.filter((t) => t.origin || t.status);

  return (
    <div>
      <PageHeader
        title="Career Profile"
        description="The one profile every tool reads. Change it here and Jobs, Resume Studio and Automations all update."
        actions={
          <>
            <ButtonLink href="/onboarding" variant="secondary">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm("Start over? This clears your profile from this browser.")) {
                  clearProfile();
                  router.push("/onboarding");
                }
              }}
            >
              <RotateCcw className="size-4" /> Start over
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-ink px-6 py-5 text-paper">
            <p className="font-display text-xl font-semibold">{profile.name}</p>
            <p className="text-sm text-paper/60">{profile.headline || "Current role not set"}</p>
          </div>
          <dl className="divide-y divide-line">
            <Row label="Target role">
              {profile.targetRole} · {profile.experienceYears} yrs experience
            </Row>
            <Row label="Locations">{profile.locations.join(", ")}</Row>
            <Row label="Minimum salary">{profile.minSalaryLpa ? `${profile.minSalaryLpa} LPA` : "Not set"}</Row>
            <Row label="Current CTC">{profile.currentCtcLpa ? `${profile.currentCtcLpa} LPA` : "Not set — add it to get a better “what to ask for”"}</Row>
            <Row label="Skills">
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <SkillChip key={s} skill={s} state="have" />
                ))}
              </div>
            </Row>
            <Row label="Deal-breakers">
              {profile.dealBreakers.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.dealBreakers.map((d) => (
                    <Badge key={d} tone="danger">
                      {d}
                    </Badge>
                  ))}
                </div>
              ) : (
                "None"
              )}
            </Row>
            <Row label="Resume">{profile.resumeFileName ?? "Not uploaded"}</Row>
          </dl>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Who uses this" subtitle="Each tool reads only what it needs" />
          <ul className="divide-y divide-line">
            {readers.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <Icon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1 text-sm">{t.name}</span>
                  {t.origin && <span className="text-xs text-muted">{t.origin}</span>}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">Stored in this browser for now. Accounts and sync come with the backend.</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-6 py-4 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
