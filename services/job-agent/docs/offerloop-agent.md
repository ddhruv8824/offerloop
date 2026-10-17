# Apply on Hirist from your PC (Offerloop job agent)

Offerloop finds jobs and waits for your approval. This agent, running on **your PC**,
applies to the Hirist jobs you approved — from a Chrome window **you** logged in to — and
reports each result back, so your Tracker updates by itself.

```
Offerloop (website)                              Your PC
 workflow finds jobs → you approve them   ──►    npm run connect
 Tracker: Applied / Needs you            ◄──     applies in your logged-in Chrome, reports back
```

- Your Hirist password and session never leave your PC. Offerloop only knows which jobs you
  approved and what happened with them.
- Only jobs you approved, only Hirist one-click ("Apply") jobs, **at most 15 a day**, with a
  45–120 second pause between applications.
- It never answers screening questions, CAPTCHAs or OTPs. Those jobs come back to you as
  **Needs you**, and a CAPTCHA stops the agent for the day.

Automated applying may break Hirist's terms of use; going slowly with your approval keeps the
risk low, but it's your account and your call.

## One-time setup

### 1. Get the code and install

```powershell
git clone https://github.com/ddhruv8824/offerloop.git   # or `git pull` in your existing copy
cd offerloop
pnpm install
```

No extra browser download is needed — the agent uses your installed Google Chrome.

### 2. Start the agent's own Chrome and log in to Hirist

Close nothing — this is a **separate** Chrome profile just for the agent. In PowerShell:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\hirist-agent-profile"
```

In that window, go to **hirist.tech**, log in (do the OTP yourself) and make sure your
Hirist profile is complete with your resume — otherwise Hirist sends Apply to registration.
You only log in once; the profile remembers it.

### 3. Connect it to Offerloop

1. On your Offerloop site: **Automations → Hirist agent → Connect your PC**.
2. Copy the two lines it shows (`OFFERLOOP_URL=…` and `OFFERLOOP_AGENT_KEY=…`).
3. In `services/job-agent`, copy `.env.example` to `.env` (if you haven't) and paste the two
   lines at the end, replacing the empty `OFFERLOOP_URL` / `OFFERLOOP_AGENT_KEY` lines.

The key is shown once. Lost it, or think someone saw it? **New key** makes a fresh one and
the old one stops working immediately.

## Every day

1. Offerloop runs your **Apply on Hirist** workflow (Automations → template, or your own
   workflow with the *Apply on Hirist* step) and waits for you.
2. Approve the jobs you want. Hirist ones are queued for the agent; career-page jobs are
   added to your Tracker to apply on the company's site.
3. On your PC — or skip this and let it [run in the background](#run-it-automatically-in-the-background-recommended):

```powershell
cd offerloop\services\job-agent
npm run connect -- --dry-run   # first time: finds each Apply button, submits nothing
npm run connect                # applies to what's approved, then exits
npm run connect -- --watch     # or keep it running: checks every 10 minutes
```

Results show up under **Automations → Hirist agent** and on your **Tracker**:

| Result | On the Tracker |
| --- | --- |
| Applied / Already applied | Card moves to **Applied** |
| Needs you (screening questions, CAPTCHA, unclear result) | Card with next step **Finish applying on Hirist** |
| Not on Hirist (company-site application) | Card with next step **Apply on the company's site** |
| Failed (job gone, Apply button missing) | Shown on the Automations page |

### Run it automatically in the background (recommended)

Once `npm run connect` works by hand, let Windows run it for you. In `services\job-agent\scripts`,
**double-click `install-schedule.cmd`** and click **Yes** when Windows asks for permission
(a task that starts at login needs it, once). From a terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
```

That creates the task **Offerloop Hirist agent**, and from then on it's hands-off:

- It starts **2 minutes after you log in to Windows**, then checks **every 15 minutes** for
  as long as you're logged in. No window opens — it runs hidden.
- Nothing approved? The check takes a few seconds and does nothing else.
- Approved Hirist jobs waiting? It opens the agent's Chrome **minimized** (if it isn't open
  already), applies to them one by one, and your Tracker updates. Chrome stays open in the
  taskbar afterwards so your Hirist login stays fresh.
- So the only thing you do is **approve jobs on Offerloop** (works from your phone too) — they're
  applied within about 15 minutes whenever your PC is on.

Check less often: `... install-schedule.ps1 -EveryMinutes 30`.

If it gets stuck — usually because Hirist logged you out — the **Hirist agent** card on
Offerloop's Automations page says so. Open the agent's Chrome from the taskbar, log in to
hirist.tech, and the next check carries on; the approved jobs wait meanwhile.

Good to know:

- It runs only while you're **logged in to Windows** (the agent uses a Chrome window on your
  desktop). A check missed while the PC was asleep happens as soon as it wakes.
- Everything is logged to `services\job-agent\data\logs\connect-YYYY-MM.log`.
- Run a check right now: `Start-ScheduledTask -TaskName "Offerloop Hirist agent"`. A dry run
  by hand: `powershell -ExecutionPolicy Bypass -File scripts\run-connect.ps1 -DryRun`.
- Pause or change it in **Task Scheduler** (Start menu → Task Scheduler → Task Scheduler
  Library → Offerloop Hirist agent), or remove it: double-click `uninstall-schedule.cmd`.

## When something's off

| Message | Fix |
| --- | --- |
| `Could not connect to Chrome on port 9222` | Start the agent's Chrome with the command in step 2 (the background task opens it by itself). |
| `Unknown or old agent key` | Make a new key on the Automations page and update `.env`. |
| `Couldn't reach https://…onrender.com` | The free server may be waking up — run it again in a minute. |
| Waits for "ACTION NEEDED: log in" | Log in to Hirist in the agent's Chrome; it continues by itself. |
| `Today's limit of 15 … used up` | The rest wait until tomorrow (a rolling 24 hours). |
| Automations page: "Your agent is stuck" / log says `Not logged in to Hirist` | Open the agent's Chrome from the taskbar, log in to hirist.tech; the next check (within 15 minutes) continues. |
| Log says `didn't open port 9222` | A window with the agent profile is open without remote debugging: close it; the next run reopens it properly. |

Developers: the loop is `src/offerloop/connect.ts` (tested with fakes in `checkConnect.ts`,
`npm run connect:test`); the server side is `apps/platform/src/lib/apply-queue.ts` and
`apps/platform/src/app/api/agent/*`.
