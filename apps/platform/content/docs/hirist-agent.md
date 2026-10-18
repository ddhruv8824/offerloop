---
title: Hirist agent
description: Apply to the Hirist jobs you approve, automatically, from your own Windows PC.
order: 21
section: Apply
---

The Hirist agent is a small program on **your** computer. It picks up the Hirist jobs you approved in Offerloop, applies to them from a Chrome window **you** logged in to, and reports each result back — so your Tracker updates by itself.

- Your Hirist password and session **never leave your PC**. Offerloop only knows which jobs you approved and what happened.
- Only jobs you approved, only Hirist one-click ("Apply") jobs, **at most 15 a day**, with a 45–120 second pause between applications.
- It never answers screening questions, CAPTCHAs or OTPs. Those jobs come back to you as **Needs you**, and a CAPTCHA stops the agent for the day.

> **Your account, your call.** Automated applying may go against Hirist's terms of use. Going slowly, with your approval, keeps the risk low — but it's your account. If in doubt, approve fewer jobs.

## What you need

- A **Windows 10 or 11** PC that's on for at least part of the day.
- **Google Chrome**.
- **Node.js 22** (LTS) from [nodejs.org](https://nodejs.org) and **Git** from [git-scm.com](https://git-scm.com).
- A **Hirist account** with your profile and resume filled in (otherwise Hirist sends Apply to a registration page).

## One-time setup (about 15 minutes)

### 1. Get the agent

Open **PowerShell** and run:

```powershell
corepack enable
git clone https://github.com/ddhruv8824/offerloop.git
cd offerloop
pnpm install
```

### 2. Log in to Hirist in the agent's own Chrome

This is a **separate** Chrome profile just for the agent; your everyday Chrome is never touched.

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\hirist-agent-profile"
```

In that window, go to **hirist.tech** and log in (do the OTP yourself). You only do this once; the profile remembers it. Close the window when you're done.

### 3. Connect it to your Offerloop account

1. In Offerloop: **Automations → Hirist agent → Connect your PC**.
2. Click **Copy** — it copies two lines (`OFFERLOOP_URL=…` and `OFFERLOOP_AGENT_KEY=…`). The key is shown **once**.
3. In `offerloop\services\job-agent`, copy `.env.example` to `.env`, open `.env` in Notepad, and paste the two lines at the end (replacing the empty ones).

### 4. Test it once by hand

```powershell
cd services\job-agent
npm run connect -- --dry-run
```

`--dry-run` finds each approved job's Apply button but clicks nothing. If it says *Nothing approved is waiting*, approve a Hirist job in Offerloop first.

### 5. Let it run in the background

Double-click `services\job-agent\scripts\install-schedule.cmd` and click **Yes** when Windows asks for permission.

From then on it's hands-off:

- It starts **2 minutes after you log in to Windows**, then checks **every 15 minutes** — hidden, no window.
- Nothing approved? It does nothing.
- Jobs approved? It opens the agent's Chrome **minimized** and applies, one at a time.
- A **Windows notification** tells you what it did ("Applied to 3 Hirist jobs"), including jobs that need you. Click it to open Offerloop.

Check that notifications work: `npm run notify:test`.

## Day to day

Approve jobs (in Offerloop or from [Signal](/docs/signal)) and the agent applies within about 15 minutes whenever your PC is on and you're logged in to Windows. The **Hirist agent** card on Automations shows:

| Status | Meaning |
| --- | --- |
| Waiting for your PC | Approved, not picked up yet. You can still **Remove** it. |
| Applying… | The agent is on it. |
| Applied / Already applied | Done. The Tracker card moves to *Applied*. |
| Needs you | Screening questions, a CAPTCHA, or an unclear result — open the job on Hirist and finish. |
| Not on Hirist | The job is applied for on the company's own site. |
| Failed | The job is gone, or its Apply button couldn't be found. |

It also shows when the agent last checked in, and how many of today's 15 applications are used.

## When something's off

| What you see | What to do |
| --- | --- |
| *Your agent is stuck and needs you* on the Hirist agent card, or a Windows pop-up | Usually Hirist logged you out: open the agent's Chrome from the taskbar, log in to hirist.tech. The next check carries on. |
| *Agent last checked in* is hours old | Is your PC on and are you logged in to Windows? Check the task: `Get-ScheduledTaskInfo -TaskName "Offerloop Hirist agent"`. |
| *Unknown or old agent key* | Click **New key** on the Hirist agent card and update `.env`. |
| *Today's limit of 15 … used up* | The rest wait until tomorrow (a rolling 24 hours). |
| *Couldn't reach …* | Your internet, or the site was restarting — the next check retries. |

Everything is logged to `services\job-agent\data\logs\connect-YYYY-MM.log`.

**Update the agent:** `git pull` then `pnpm install` in the `offerloop` folder. **Remove it:** double-click `scripts\uninstall-schedule.cmd`, and click **Disconnect** on the Hirist agent card.
