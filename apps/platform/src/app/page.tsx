import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  FileText,
  GraduationCap,
  Hand,
  KanbanSquare,
  KeyRound,
  Laptop,
  ListChecks,
  Scale,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";
import { authMode, signupMode } from "@/lib/server/auth/config";
import { currentUser } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

const LOOP = [
  { time: "09:00", icon: Search, title: "Offerloop finds today's jobs", text: "Hirist and 30+ company career pages, scored against your profile. Weak fits and deal-breakers are filtered out." },
  { time: "09:01", icon: Bell, title: "You get a Signal message", text: "The best matches, with their fit and the new tools they ask for. Tap Approve all, or approve just the ones you like." },
  { time: "09:15", icon: Laptop, title: "Your PC applies on Hirist", text: "A small agent on your own computer applies from your own logged-in browser — your password never leaves your PC." },
  { time: "Later", icon: KanbanSquare, title: "Track, prepare, learn", text: "Applications land on your Tracker, replies from Gmail move them along, and new tools go on your Learn list." },
];

const FEATURES = [
  { icon: Search, title: "Job Finder with real fit scores", text: "Skills, role, experience, location and pay — with a verdict and the reasons for and against. Deal-breakers hide jobs for you.", href: "/docs/jobs" },
  { icon: Workflow, title: "Automations", text: "Chain steps into a daily workflow: find, check pay and culture, wait for your approval, apply, track. Runs on the server, on schedule.", href: "/docs/automations" },
  { icon: Laptop, title: "Hirist agent", text: "Applies to the Hirist jobs you approve, at most 15 a day, from your PC in the background. Screening questions come back to you.", href: "/docs/hirist-agent" },
  { icon: Bell, title: "Approve from Signal", text: "A message when your workflow is waiting, with one-tap approve links. No app to open.", href: "/docs/signal" },
  { icon: FileText, title: "Resume Studio", text: "Your resume tailored to each job description, checked by a second AI acting as the recruiter. Every edit is yours to accept — nothing invented.", href: "/docs/resume-studio" },
  { icon: GraduationCap, title: "Learn", text: "The new tools your applications ask for, with study notes, a diagram and likely interview questions — written around what you already know.", href: "/docs/learn" },
  { icon: KanbanSquare, title: "Tracker + Gmail", text: "Every application on one board. Connect Gmail and interview invites, assessments and rejections update it for you.", href: "/docs/tracker" },
  { icon: ListChecks, title: "DSA Prep", text: "The most-asked LeetCode questions for the companies you're interviewing with, in order, with your progress.", href: "/docs/dsa" },
];

const PRINCIPLES = [
  { icon: Hand, title: "You approve every application", text: "Nothing is sent without your yes. Offerloop never messages recruiters for you." },
  { icon: Scale, title: "Fewer, better applications", text: "A clear 'skip this one' beats fifty applications into silence." },
  { icon: KeyRound, title: "Your keys stay yours", text: "Bring your own AI key; your Hirist login stays on your PC. Your data is yours alone." },
];

export default async function Landing() {
  const accounts = authMode() === "accounts";
  const signedIn = accounts && Boolean(await currentUser().catch(() => null));
  const invite = signupMode() === "invite";
  const primary = !accounts || signedIn ? { href: "/dashboard", label: "Open Offerloop" } : { href: "/signup", label: invite ? "Join with an invite" : "Create your account" };

  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <header className="flex items-center justify-between gap-4 py-5">
            <Logo dark />
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/docs" className="rounded-md px-3 py-2 text-paper/75 hover:bg-paper/10 hover:text-paper">
                Docs
              </Link>
              {accounts && !signedIn ? (
                <Link href="/login" className="rounded-md px-3 py-2 text-paper/75 hover:bg-paper/10 hover:text-paper">
                  Log in
                </Link>
              ) : null}
              <ButtonLink href={primary.href} className="ml-1 px-3 py-1.5 text-sm">
                {signedIn || !accounts ? "Open" : "Sign up"}
              </ButtonLink>
            </nav>
          </header>

          <div className="grid gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
            <div className="animate-fade-in">
              <p className="mb-4 font-mono text-xs tracking-widest text-coral uppercase">Your job switch, on autopilot — with you in charge</p>
              <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
                Wake up to the right jobs.
                <br />
                Approve from your phone.
              </h1>
              <p className="mt-5 max-w-xl text-base text-paper/70">
                Offerloop finds roles that fit you every morning, asks before it does anything, applies on Hirist from your own computer, and keeps your
                tracker, resume and interview prep in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={primary.href} className="px-5 py-2.5">
                  {primary.label} <ArrowRight className="size-4" />
                </ButtonLink>
                <ButtonLink href="/docs" variant="ghost" className="px-5 py-2.5 text-paper/80 hover:bg-paper/10 hover:text-paper">
                  <BookOpen className="size-4" /> How it works
                </ButtonLink>
              </div>
              <p className="mt-4 text-xs text-paper/45">
                {accounts && invite ? "Early access: sign-up is by invite while we grow." : "Free while in early access."}
              </p>
            </div>

            {/* A glimpse of the morning message */}
            <div className="rounded-2xl border border-ink-line bg-ink-soft p-5 shadow-2xl" aria-hidden>
              <p className="mb-3 flex items-center gap-2 text-xs text-paper/50">
                <Bell className="size-3.5" /> Signal · 9:01
              </p>
              <div className="space-y-2 rounded-xl bg-paper/5 p-4 text-sm text-paper/85">
                <p className="font-semibold">Apply on Hirist found 8 jobs, waiting for your approval.</p>
                {[
                  ["AI Engineer — Tredence", "74%", "Good fit"],
                  ["AI Platform Engineer — KreditBee", "71%", "Good fit"],
                  ["Applied AI Engineer — AuxoAI", "68%", "new: CrewAI, MCP"],
                ].map(([job, score, note]) => (
                  <p key={job} className="flex justify-between gap-3 text-paper/75">
                    <span className="truncate">{job}</span>
                    <span className="shrink-0 font-mono text-xs text-paper/50">
                      {score} · {note}
                    </span>
                  </p>
                ))}
                <p className="pt-1 font-semibold text-coral">APPROVE ALL 8 →</p>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {["Approved 8 · queued for your PC", "Applied to 6 on Hirist", "2 need you: screening questions", "CrewAI + MCP added to Learn"].map((line, i) => (
                  <div key={line} className="flex items-center gap-3 rounded-md bg-paper/5 px-3 py-2">
                    <span className={i === 2 ? "text-coral" : "text-success"}>{i === 2 ? <ArrowRight className="size-4" /> : <Check className="size-4" />}</span>
                    <span className="text-paper/80">{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The daily loop */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <h2 className="text-2xl font-semibold">Your morning, handled</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">Set it up once. After that, the only thing you do is approve.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map(({ time, icon: Icon, title, text }) => (
            <li key={title} className="rounded-lg border border-line bg-paper p-5">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-coral-strong" aria-hidden />
                <span className="font-mono text-xs text-muted">{time}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold">Everything for the switch, in one place</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">Each tool works on its own. Together they share one profile, one tracker and one plan.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text, href }) => (
              <Link key={title} href={href} className="group flex flex-col gap-3 rounded-lg border border-line p-5 hover:border-faint">
                <span className="grid size-10 place-items-center rounded-md bg-coral-wash text-coral-strong">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="flex-1 text-sm text-muted">{text}</p>
                <span className="text-xs font-semibold text-coral-strong group-hover:underline">Read the guide →</span>
              </Link>
            ))}
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
        <div className="mt-10 flex items-start gap-2 rounded-lg border border-line bg-paper p-4 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p>
            Automated applying may go against a job board&apos;s terms. Offerloop keeps it slow, capped and approved by you — but it&apos;s your account and
            your call. Read the{" "}
            <Link href="/docs/hirist-agent" className="font-semibold text-coral-strong hover:underline">
              Hirist agent guide
            </Link>{" "}
            before turning it on.
          </p>
        </div>
      </section>

      <section className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="text-2xl font-semibold text-paper">Ready to plan your switch?</h2>
            <p className="mt-1 text-sm text-paper/60">Set up your profile once. Every tool uses it.</p>
          </div>
          <ButtonLink href={primary.href} className="px-5 py-2.5">
            {primary.label} <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted sm:px-8">
        <Logo />
        <Link href="/docs" className="hover:text-text">
          Docs
        </Link>
        <Link href="/privacy" className="hover:text-text">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-text">
          Terms
        </Link>
        <span className="ml-auto text-xs">© {new Date().getFullYear()} Offerloop · early access</span>
      </footer>
    </div>
  );
}
