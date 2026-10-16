# Offerloop

One workspace for a job switch: find roles that fit, tailor the resume, practice the
interview, track every application. Each tool is a standalone module that also plugs
into this platform, and all of them read one shared career profile.

## Run it

Requirements: Node 20+, pnpm 10.

```bash
pnpm install
pnpm dev
```

Everything is one Next.js app on http://localhost:3100 — pages and APIs, including Resume
Studio's engine (`/api/redline/*`, served in-process by `modules/resume-studio/src/server`).

### Deploy

**Free (recommended): Render + Supabase + cron-job.org** — step-by-step in
[`deploy/RENDER.md`](deploy/RENDER.md). [`render.yaml`](render.yaml) sets up the Render
service; data lives in a free Supabase Postgres (`DATABASE_URL`); a free pinger keeps the
app awake and runs automations.

**Your own server** (e.g. Oracle Cloud's free VM): [`deploy/ORACLE.md`](deploy/ORACLE.md) —
the app plus Caddy for HTTPS (`deploy/docker-compose.yml`).

Any other host that runs a Docker image works too (Railway, Fly.io):

```bash
pnpm build && pnpm start          # production locally
docker build -t offerloop .
docker run -p 3100:3100 -v offerloop-data:/data --env-file apps/platform/.env.local offerloop
```

Saved workflows and Resume Studio workspaces live in `/data` — mount a volume there or
they're lost on redeploy — or set `DATABASE_URL` to any Postgres (Supabase, Neon…) and no
disk is needed (`shared/storage`: one table, `offerloop_kv`, created on first start). The host must allow long-running responses (tailoring streams
its progress), so serverless platforms like Vercel don't fit yet. Run one copy only.

**Before going public**, set `APP_PASSWORD`: every page and API then needs that password
once per browser (`src/proxy.ts`). Without it the site is open — fine on your own PC only.
Behind a proxy, set `PUBLIC_URL` (e.g. `https://offerloop.example.com`) so redirects and
the Gmail callback use the public address (on Render it's picked up automatically).

### Resume Studio

Upload a resume, paste a job description, review every edit as a redline, download the PDF.
`modules/resume-studio` is both halves: the React UI (`src/`) and the engine
(`src/server/`, imported as `@offerloop/resume-studio/server`):

- **AI** — bring your own key: Gemini, OpenAI, Claude or Groq, through the Vercel AI SDK.
  The key travels per request (`X-LLM-Key`) and is never stored or logged. Optional
  server-side keys go in `apps/platform/.env.local` (see `.env.example`).
- **Tailoring** (`tailor.ts`) — analyse the JD (cached per JD), propose edits, review them
  against the master profile (`validation.ts`: flags unverified skills and numbers, never
  edits company/title/dates/education), then score ATS keywords before → after. Every
  step is saved as the run's log ("Run log" in the UI).
- **Chat** (`chat.ts`) — edit, answer or record a fact the user states; remembers the
  conversation per workspace.
- **Files** (`extract.ts`) — PDFs go to the model as-is where it can read them; Groq gets
  column-aware extracted text (two-column resumes are read column by column).
- **Storage** (`store.ts`) — JSON files under `<OFFERLOOP_DATA_DIR>/redline`
  (`apps/platform/.data/redline` locally), one folder per browser workspace; or the
  database when `DATABASE_URL` is set.

`pnpm --filter @offerloop/resume-studio test` runs the engine's tests with the model scripted,
so no key is needed.

### Job Finder

Live roles, scored against the profile. Three steps, all in `apps/platform/src`:

1. **Collect** (`lib/server/jobs/`): Hirist search (read-only, no login — the JSON API
   Hirist's own site uses, so get their OK before a public launch) plus the public job feeds
   of the companies in `sources.ts` (Ashby, SmartRecruiters; Greenhouse and Lever connectors
   exist but are unverified — see below). Cached in memory, at most 4 requests per site at once.
2. **Score and clean** (`lib/jobs.ts`, pure, tested): role fit, skills, experience, location;
   drops other-country and unrelated roles; merges the same role listed twice; flags
   experience gaps, old postings and deal-breakers.
3. **Show** (`app/(app)/jobs`): results, filters, Track, and "paste a link" (`/api/jobs/import`,
   which refuses non-https, private and internal addresses).

**Salary and culture** (`lib/company-info.ts`, pure, tested): Hirist attaches an
employee-review summary (from AmbitionBox) to roughly a quarter of its listings — rating,
review count, benefits, company size and type. It is shown beside the job with its source and
a link back, and a rating under 3 from 10+ reviews adds a warning (it never changes the match
score). Salary is shown when the posting states it (Hirist's salary field, or pay written in
any description, e.g. "CTC 18–25 LPA"). In workflows, "Get salary & culture insights" reports
how many jobs had data and shows it on the approval card. Not scraped from anywhere; get
AmbitionBox's permission before showing their data in a public product.

**What to ask for** (`lib/salary.ts`, pure, tested): only about 6% of postings publish pay, so
`lib/server/jobs/market.ts` keeps every one it sees (`salaryObservations` in the data file,
dropped after 120 days) and, at most twice a day per role, samples ~300 Hirist postings to
find more. `marketRange` turns those into a range for the person's role, experience and city
— widening city → India → all levels only when there are too few, and returning nothing below
3 postings. `recommendAsk` combines it with the person's current CTC (+30%, a normal switch
raise) and minimum; a job that states its own pay gets its own figure, placed by where the
person sits in the experience band it asks for. Every answer shows its reasons, cautions and
how many postings it rests on. It is negotiation guidance, not a prediction.

To add a company, add a line to `SOURCES` in `lib/server/jobs/sources.ts` (its board id is in
its careers-page URL). `GET /api/jobs/verify-sources` (development only) reports which
`CANDIDATES` respond from your machine; `?list=sources` re-checks the live list.

Greenhouse and Lever: every request timed out from the network this was built on, so their
candidate companies are not in `SOURCES`. On a network where
`https://boards-api.greenhouse.io/v1/boards/stripe/jobs` opens, run verify-sources and move
the ones that respond.

### Automations

Workflows run on the server, so they work with the browser closed.

- **Storage** — `apps/platform/.data/automations.json` (override with `OFFERLOOP_DATA_DIR`;
  `/data` in Docker), or the database when `DATABASE_URL` is set: workflows, the last 100 runs, the profile to search with, and
  which jobs each workflow has already reported. One file, no database. Single-user until
  accounts exist.
- **Scheduler** — `src/instrumentation.ts` starts `lib/server/automations/scheduler.ts` when
  the server boots. Every 30 seconds it starts any workflow whose slot has passed
  (`lib/schedule.ts`, pure and tested; clock times are in the user's timezone). A slot runs
  once; after downtime it catches up once, for the latest missed slot.
- **Runner** — `lib/server/automations/engine.ts`: one step at a time, saved after each,
  pausing at "Wait for my approval". Steps without a live backend yet (resume tailoring,
  Hirist apply, company research, mock interview) are marked "skipped", never faked.
- **Tracker** — lives in the browser, so "Add to my tracker" queues jobs on the run and the
  next open Offerloop tab adds them (no duplicates).
- **Backup trigger** — for hosts that sleep, set `CRON_SECRET` (16+ characters) and have any
  outside timer call
  `curl -X POST https://your-site/api/automations/tick -H "Authorization: Bearer $CRON_SECRET"`.
  It runs the same check, so using both is harmless.

The API has no login yet: anyone who can reach the server can read and run workflows. Fine on
your own machine; add accounts before exposing it publicly.

### Gmail → Tracker (optional)

The Tracker can read job emails (read-only) and move cards by itself: in review,
assessment, interview, offer, rejected. To enable it:

1. Google Cloud Console: create a project, enable the **Gmail API**.
2. OAuth consent screen: External, add yourself as a **test user**, add the `gmail.readonly` scope.
3. Credentials → OAuth client ID → **Web application**, redirect URI
   `http://localhost:3100/api/inbox/google/callback`.
4. Copy `apps/platform/.env.example` to `apps/platform/.env.local` and fill in
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `INBOX_SECRET`; restart `pnpm dev`.

Without it, **Try a sample inbox** on the Tracker runs the same detector on built-in sample
emails (development only).

How it works: `src/lib/email-classifier.ts` classifies an email (rule-based, high/low
confidence; `pnpm --filter @offerloop/platform test`), `src/app/api/inbox/*` handles Google
sign-in and scanning (the token is kept in an encrypted httpOnly cookie; scans return
classifications, never email bodies), and `src/lib/tracker.ts` applies results: high
confidence moves a matched card forward with an undo, anything unsure becomes a "Needs your
review" item. `gmail.readonly` is a restricted scope — fine for test users, but a public
launch needs Google's verification.

## Layout

```
offerloop/
├── apps/
│   └── platform/          Next.js app: landing, dashboard, tools, all APIs (:3100)
├── modules/
│   └── resume-studio/     Resume Studio: <ResumeStudio apiUrl embedded /> + its engine (./server)
├── shared/
│   └── storage/           Saved data: JSON files, or Postgres when DATABASE_URL is set
├── services/
│   └── job-agent/         Job application & discovery agent (runs locally, not deployed)
└── Dockerfile             Single-container deployment image
```

### Commands

| Command | What it runs |
|---|---|
| `pnpm dev` | The platform in development (:3100) |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm test` | Platform, Resume Studio and storage tests (`TEST_DATABASE_URL` = a throwaway Postgres also runs the database tests) |
| `pnpm typecheck` | TypeScript checks in every package |
| `pnpm dev:job-agent` | The Job Apply Agent |
