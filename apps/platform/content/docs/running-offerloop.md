---
title: Running Offerloop (admins)
description: Host Offerloop for yourself and others — Render, Supabase sign-in, invites, Gmail and settings.
order: 90
section: Run it
---

This page is for whoever **runs** an Offerloop: the admin. It assumes the free setup — **Render** runs the app, **Supabase** holds the database and handles sign-in, and **cron-job.org** keeps the app awake. The step-by-step server setup is in [`deploy/RENDER.md`](https://github.com/ddhruv8824/offerloop/blob/main/deploy/RENDER.md); this page covers accounts and day-to-day admin.

## Turn on accounts

Without Supabase sign-in settings, Offerloop is a **one-person install** (optionally behind `APP_PASSWORD`). Adding them turns on accounts: sign-up, log-in, one private space per person.

### 1. Supabase: get the URL and key

In your Supabase project, click **Connect** (top bar) → **App Frameworks** → **Next.js**, and copy the **URL** and the **anon** (or *publishable*) **key**.

### 2. Supabase: sign-in settings

**Authentication → Sign In / Providers**

- **Email:** on. **Allow new users to sign up:** on.
- **Confirm email: off** — until you add your own email sender (below). Supabase's built-in sender only delivers to members of your Supabase team, so new users would never get the confirmation email. Invite codes keep strangers out meanwhile.

**Authentication → URL Configuration**

- **Site URL:** your address, e.g. `https://offerloop-xxxx.onrender.com`
- **Redirect URLs:** add `https://offerloop-xxxx.onrender.com/auth/callback`

### 3. Google sign-in (recommended)

Needs no emails, and you probably already have a Google Cloud project (for Gmail).

1. Google Cloud → **APIs & Services → Credentials** → your OAuth client (Web application) → **Authorized redirect URIs**: add `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows this exact URL on its Google provider page).
2. Supabase → **Authentication → Sign In / Providers → Google**: turn on, paste the client ID and secret, save.

### 4. Render: settings

In Render → your service → **Environment**, add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | The URL from step 1 |
| `SUPABASE_ANON_KEY` | The key from step 1 |
| `ADMIN_EMAILS` | Your email (comma-separate several). Admins need no invite code and get the Admin page. |
| `PUBLIC_URL` | Your address, e.g. `https://offerloop-xxxx.onrender.com` |
| `SUPPORT_EMAIL` | Where users can reach you (shown in the privacy policy and terms). |
| `INVITE_CODES` | Optional: codes that always work, comma-separated (e.g. `FRIENDS2026`). |
| `SIGNUP_MODE` | Optional: `open` lets anyone sign up without a code. Default: invite-only. |

Save; Render redeploys. `APP_PASSWORD` is no longer used once accounts are on — remove it.

### 5. Sign in first

Open the site and sign up (or continue with Google) **with your admin email** first. The data from before accounts — workflows, runs, the Hirist queue and agent key, Learn notes, Signal settings — moves into your account on that first sign-in. Your PC's Hirist agent keeps working with its current key. Open Resume Studio once in the browser you used before, and your resume workspace moves into your account too.

## Invite people

Open **Admin** (the shield icon next to your email). Create a code — one use per person, or more for a group — and send it with your sign-up link (`/signup`). The page lists every code, how often it's been used, and every member. Turning a code off doesn't remove people who already joined with it.

To remove someone's access, delete their user in **Supabase → Authentication → Users**.

## Gmail for other users

Google lets an app read Gmail only for **100 test users** until it passes Google's verification (a paid security review for Gmail access). To let someone use **Connect Gmail**:

Google Cloud → **Google Auth Platform → Audience** (or *OAuth consent screen*) → **Test users** → add their Gmail address.

Everyone else uses the Tracker without Gmail updates.

## Email (password resets, confirmations)

To send password-reset and confirmation emails to anyone, connect an email service with **your own domain**:

1. Buy a domain and point it at Render (**Settings → Custom Domains** in Render).
2. Create a free [Resend](https://resend.com) account, verify the domain, and create an SMTP password.
3. Supabase → **Authentication → Emails → SMTP Settings**: host `smtp.resend.com`, port `465`, user `resend`, your Resend key as the password, sender `no-reply@yourdomain`.
4. Then you can turn **Confirm email** back on.

Until then, reset a user's password from **Supabase → Authentication → Users → … → Send password recovery**, or let them use Google sign-in.

## Keep it awake and on schedule

On Render's free plan the app sleeps after 15 minutes without traffic. Keep two cron-job.org jobs:

- `GET /api/health` every 5 minutes — keeps it awake;
- `POST /api/automations/tick` every 10 minutes with `Authorization: Bearer <CRON_SECRET>` — starts due workflows even right after a deploy.

The built-in scheduler checks every member's workflows every 30 seconds while the app is awake.

## Limits of the free setup

One small server (512 MB) runs everyone's job searches. A few dozen active users is fine; beyond that, move to a paid Render instance. Supabase's free database is 500 MB, plenty for thousands of users' text data.
