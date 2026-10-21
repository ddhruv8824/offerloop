# Offerloop

**Your job switch, on autopilot — with you in charge.** Offerloop finds roles that fit you every
morning, asks before it does anything, applies on Hirist from your own computer, and keeps your
tracker, resume and interview prep in one place.

- **Job Finder** — live roles from Hirist and 30+ company career pages, scored against your
  profile with a verdict and reasons; deal-breakers hide jobs for you.
- **Automations** — daily workflows that find, check pay and culture, wait for your approval,
  apply and track. Runs on the server, on schedule.
- **Hirist agent** — applies to approved Hirist jobs from your own PC in the background (at most
  15 a day), with Windows notifications.
- **Signal alerts** — a message when a workflow is waiting, with one-tap approve links.
- **Resume Studio** — tailor your resume to a job; a second AI reviews the edits like a
  recruiter; nothing invented, every edit yours to accept.
- **Learn** — the new tools your applications ask for, with AI study notes, diagrams and
  interview questions.
- **Tracker + Gmail** — one board for every application, updated by your workflows, your agent
  and your inbox.
- **DSA Prep** — the most-asked LeetCode questions for the companies you're interviewing with.

Accounts are invite-only (Supabase Auth: email + password or Google). Every person's data is
their own.

**User guide:** the `/docs` pages of any Offerloop (source: [`apps/platform/content/docs`](apps/platform/content/docs)) —
[getting started](apps/platform/content/docs/getting-started.md),
[automations](apps/platform/content/docs/automations.md),
[Hirist agent](apps/platform/content/docs/hirist-agent.md),
[Signal](apps/platform/content/docs/signal.md),
[running Offerloop as an admin](apps/platform/content/docs/running-offerloop.md).

---

## Run it locally

Requirements: Node 22, pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3100
```

Without Supabase settings it runs as a **one-person install**: no sign-in, your data under the
`local` user in `apps/platform/.data`. Add the settings below to try accounts.

## Deploy

**Free: Render + Supabase + cron-job.org** — step by step in [`deploy/RENDER.md`](deploy/RENDER.md);
accounts, invites, Google sign-in and Gmail testers in
[Running Offerloop](apps/platform/content/docs/running-offerloop.md).
[`render.yaml`](render.yaml) sets up the Render service.

**Azure App Service** (B1, deploys from GitHub Actions): [`deploy/AZURE.md`](deploy/AZURE.md).

Any host that runs a Docker image works ([`Dockerfile`](Dockerfile); your own VM with Caddy:
[`deploy/ORACLE.md`](deploy/ORACLE.md)). The host must allow long-running responses (tailoring
streams progress) and run **one** copy (the scheduler lives in the process), so serverless
platforms don't fit.

## Configuration

Set in `apps/platform/.env.local` locally, or in your host's environment.

| Variable | What it does |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Turn on accounts (Supabase Auth). Without them: one-person install. |
| `ADMIN_EMAILS` | Comma-separated admins: no invite needed, Admin page (invites, members). The first admin to sign in inherits the data from before accounts. |
| `INVITE_CODES` | Optional codes that always work. Others are made on the Admin page. |
| `SIGNUP_MODE` | `open` = anyone can sign up. Default: invite-only. |
| `DATABASE_URL` | Postgres (e.g. Supabase session pooler). Without it, JSON files under `OFFERLOOP_DATA_DIR`. |
| `PUBLIC_URL` | The site's address (redirects, Signal links). On Render, `RENDER_EXTERNAL_URL` is used. |
| `SUPPORT_EMAIL` | Contact shown in the privacy policy and terms. |
| `INBOX_SECRET` | 16+ random characters: encrypts the Gmail cookie and stored secrets (CallMeBot keys). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail → Tracker (optional). |
| `CRON_SECRET` | Enables `POST /api/automations/tick` for an outside timer. |
| `GEMINI_API_KEY` (etc.) | Optional server-side AI keys; otherwise each user brings their own. |
| `APP_PASSWORD` | One-person install only: a site password. |

## How it fits together

```
offerloop/
├── apps/platform/          Next.js app: landing, docs, sign-in, every tool, all APIs (:3100)
│   ├── content/docs/       The user guide (Markdown, rendered at /docs)
│   └── content/legal/      Privacy policy and terms
├── modules/resume-studio/  Resume Studio: the UI + its engine (@offerloop/resume-studio/server)
├── shared/storage/         Key → JSON storage: files, or one Postgres table (offerloop_kv)
├── services/job-agent/     The Hirist agent that runs on a user's PC
└── Dockerfile              One image, one process
```

### Accounts and data

- **Sign-in** (`src/lib/server/auth/`): Supabase Auth on the server with session cookies
  (`@supabase/ssr`) — email + password, Google, password reset. `src/proxy.ts` keeps the session
  fresh and sends signed-out visitors to `/login`; pages and APIs check **membership** (an
  invite code redeemed, or an admin email) with `requireMember()` / `memberRoute()`.
- **Per-person data** (`src/lib/server/store.ts`): `users/<uid>/automations` (workflows, runs,
  Hirist queue, Learn list, Signal settings), `users/<uid>/learn-notes/*`, `users/<uid>/docs/*`
  (profile, tracker and DSA progress, mirrored from the browser by `src/lib/sync.ts`). Shared:
  `market` (pay from public postings). Indexes map secrets to their owner:
  `index/agent-keys/<hash>`, `index/approval-links/<hash>`.
- **Resume Studio** is pinned to the account's workspace (`handleRedlineRequest(..., { workspace })`).
- **Old single-user data** moves once (`src/lib/server/legacy.ts`): to the local user on a
  one-person install, then to the first admin who signs in.

### Job Finder

`src/lib/server/jobs/` collects (Hirist search plus company job feeds in `sources.ts`, cached,
≤4 requests per site at once); `src/lib/jobs.ts` (pure, tested) scores skills/role/experience/
location, explains the fit, applies deal-breaker vetoes, and merges duplicates. "Role first"
weights the role over tools a person hasn't used yet. Pay: `src/lib/salary.ts` estimates what
to ask for from postings that publish pay (`market.ts` keeps them for 120 days).

### Automations

`src/lib/server/automations/`: the **scheduler** (started by `src/instrumentation.ts`) checks
every member's workflows every 30 seconds and picks up runs a restart cut off; the **engine**
runs one step at a time, saved after each, pausing at "Wait for my approval", with a 6-minute
limit per step. **Apply on Hirist** queues approved jobs (`src/lib/apply-queue.ts`, 15 a day)
for the agent, which uses `/api/agent/*` with a per-person key. **Signal**
(`src/lib/server/notify/signal.ts`) sends the approval message through CallMeBot with one-tap
links (`/a/<token>` → confirm page; secrets hashed, 24-hour, single run).

### Resume Studio

`modules/resume-studio`: bring-your-own-key AI (Gemini, OpenAI, Claude, Groq via the Vercel AI
SDK; keys travel per request, never stored). Tailoring = analyse the JD → draft edits →
recruiter review (`review.ts`) → honesty checks against the master profile (`validation.ts`) →
ATS score. Also chat, PDF/DOCX parsing, and study notes for Learn (`study-notes.ts`).

### Gmail → Tracker

`src/app/api/inbox/*`: read-only Google sign-in, the token in an encrypted httpOnly cookie,
scans return classifications (sender/subject, never bodies); `src/lib/email-classifier.ts`
(tested) classifies; the Tracker moves clear cases and asks about the rest. `gmail.readonly` is
restricted: up to 100 test users until Google verifies the app.

## Commands

| Command | What it runs |
| --- | --- |
| `pnpm dev` | The app in development (:3100) |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm test` | Platform, Resume Studio and storage tests (`TEST_DATABASE_URL` = a throwaway Postgres also runs the database tests) |
| `pnpm typecheck` | TypeScript checks in every package |
| `cd services/job-agent && npm run connect` | The Hirist agent once (`-- --dry-run` to click nothing) |
