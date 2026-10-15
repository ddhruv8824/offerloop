import { ArrowRight, Check, Hand, KeyRound, Scale } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SampleProfileButton } from "@/components/SampleProfileButton";
import { ButtonLink } from "@/components/ui";
import { TOOLS } from "@/lib/tools";

const JOURNEY = [
  { step: "01", title: "Find", text: "Roles from company career pages and job boards, ranked against your profile. Weak fits are flagged before you spend an evening on them." },
  { step: "02", title: "Tailor", text: "Your resume rewritten for each job description — every AI edit is a card you accept or reject. Nothing invented." },
  { step: "03", title: "Practice", text: "Voice mock interviews and coding rounds shaped around the company you're actually interviewing with." },
  { step: "04", title: "Track & decide", text: "One board for every application: what you sent, what they said, and what to do next." },
];

const PRINCIPLES = [
  { icon: Hand, title: "You approve every application", text: "Offerloop prepares everything. It applies on Hirist only after you approve, and never messages anyone." },
  { icon: Scale, title: "Fewer, better applications", text: "A clear 'skip this one' beats fifty applications into silence." },
  { icon: KeyRound, title: "Your data, your keys", text: "Bring your own AI key. Your profile stays yours." },
];

export default function Landing() {
  const modules = TOOLS.filter((t) => t.origin || t.status);

  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <header className="flex items-center justify-between py-5">
            <Logo dark />
            <ButtonLink href="/dashboard" variant="ghost" className="text-paper/80 hover:bg-paper/10 hover:text-paper">
              Open workspace
            </ButtonLink>
          </header>

          <div className="grid gap-12 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
            <div className="animate-fade-in">
              <p className="mb-4 font-mono text-xs tracking-widest text-coral uppercase">Your job switch workspace</p>
              <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
                Switch jobs with a plan,
                <br />
                not a spray of applications.
              </h1>
              <p className="mt-5 max-w-xl text-base text-paper/70">
                Find roles that actually fit, tailor your resume for each one, practice the interview, and track it all — in one place that
                knows your profile.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/onboarding" className="px-5 py-2.5">
                  Start your switch <ArrowRight className="size-4" />
                </ButtonLink>
                <SampleProfileButton variant="ghost" />
              </div>
              <p className="mt-4 text-xs text-paper/45">Takes about 2 minutes. No account needed to try it.</p>
            </div>

            {/* Product glimpse */}
            <div className="rounded-xl border border-ink-line bg-ink-soft p-5 shadow-2xl" aria-hidden>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">Frontend Developer · Northwind Pay</span>
                <span className="rounded-sm bg-success/20 px-2 py-0.5 font-mono text-xs text-success">86 match</span>
              </div>
              <div className="space-y-2 text-sm">
                {["Resume tailored · v3 ready", "Applied 6 days ago", "Mock interview · 7.2 / 10", "Technical round on Friday"].map((line, i) => (
                  <div key={line} className="flex items-center gap-3 rounded-md bg-paper/5 px-3 py-2">
                    <span className={i < 3 ? "text-success" : "text-coral"}>{i < 3 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}</span>
                    <span className="text-paper/80">{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <h2 className="text-2xl font-semibold">One journey, four stages</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">Every stage hands its work to the next, so nothing gets typed twice.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((s) => (
            <div key={s.step} className="rounded-lg border border-line bg-paper p-5">
              <span className="font-mono text-xs text-coral-strong">{s.step}</span>
              <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold">The tools inside</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">Each tool also works on its own. Together they share one profile and one tracker.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((tool) => {
              const Icon = tool.icon;
              return (
                <div key={tool.id} className="flex gap-4 rounded-lg border border-line p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-coral-wash text-coral-strong">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{tool.name}</h3>
                    <p className="mt-1 text-sm text-muted">{tool.tagline}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="size-5 text-coral-strong" aria-hidden />
              <h3 className="mt-3 text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="text-2xl font-semibold text-paper">Ready to plan your switch?</h2>
            <p className="mt-1 text-sm text-paper/60">Set up your profile once. Every tool uses it.</p>
          </div>
          <ButtonLink href="/onboarding" className="px-5 py-2.5">
            Start your switch <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
