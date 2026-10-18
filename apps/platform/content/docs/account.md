---
title: Your account and data
description: Signing in, what Offerloop stores, where it goes, and how to delete it.
order: 50
section: Account
---

## Signing in

Log in with **email and password** or **Continue with Google**. Forgot your password? Use **Forgot your password?** on the log-in page (if you signed up with Google, just continue with Google — there's no password). If the reset email doesn't arrive, ask the person who invited you; they can reset it for you.

Log out from the icon next to your email at the bottom of the sidebar.

## Your data is yours

Everything you add is private to your account — no other user can see it:

| What | Where it's kept |
| --- | --- |
| Profile, Tracker, DSA progress | Your account (and a copy in your browser, so it's fast and works offline). |
| Workflows, runs, Hirist queue, Learn list and notes | Your account. |
| Resume, master profile, tailored versions | Your account (Resume Studio). |
| Signal alerts details | Your account; the CallMeBot key is encrypted. |
| AI keys (Gemini, OpenAI, …) | **Only your browser.** Sent with each AI request, never stored on the server. |
| Hirist password and session | **Only your PC** (the agent's own Chrome profile). |
| Gmail access | A read-only Google token in an encrypted cookie in your browser. |

Data is stored in a Postgres database (Supabase) and the site runs on Render. Pay figures from public job postings are shared between users anonymously to estimate market pay — never anything from your profile.

See the [privacy policy](/privacy) for the details.

## Several devices

Log in anywhere: your profile, Tracker, DSA progress, workflows, resume and notes come with you. If someone else logs in on the same browser, Offerloop clears your copy from it first.

## Deleting your data

- **Signal alerts:** *Remove* on the Signal alerts card.
- **Hirist agent:** *Disconnect* on the Hirist agent card, then run `uninstall-schedule.cmd` on your PC.
- **Gmail:** *Disconnect* on the Tracker, and remove Offerloop at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Your whole account:** contact the person who runs your Offerloop (see the [privacy policy](/privacy)); everything stored for your account is deleted.
