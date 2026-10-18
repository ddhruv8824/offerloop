---
title: Automations
description: Chain steps into a workflow that runs on schedule and always waits for your approval.
order: 20
section: Apply
---

An automation (a *workflow*) is a list of steps that runs on the server — on a schedule, or when you click **Run now** — even with Offerloop closed. Before anything is applied to, it stops at **Wait for my approval**.

## Start from a template

| Template | What it does |
| --- | --- |
| **Apply on Hirist** | Every morning: find Hirist jobs, check pay and culture, wait for your approval, queue the approved ones for the [Hirist agent](/docs/hirist-agent), add them to your Tracker, and write a recap. |
| **Daily job hunt** | Same, from Hirist and company career pages, without applying — you apply on the company sites. |
| **Apply to one job** | Paste a job link: pay and culture, then wait for you. |
| **Interview prep** | Paste a job link: the pay to ask for, and the company's most-asked DSA questions. |

Or click **New workflow** and build your own.

## The steps

| Step | What it does |
| --- | --- |
| Find new jobs | Searches and scores jobs ([details](/docs/jobs)). Settings: *From* (Hirist, career pages, or both), *New tools in the JD* ([role first](/docs/jobs#role-first-when-new-tools-shouldn-t-count-against-you)), *Minimum match*, *At most* N jobs. Jobs you've already applied to or queued are left out. |
| Use a job I paste | Starts from one job link you give when you run it. |
| Get salary & culture insights | Employee ratings where available, stated pay, and **what to ask for** — from the job's own pay, or from what similar roles publish. |
| Wait for my approval | Stops until you tick the jobs to keep. Only those continue. |
| Apply on Hirist | Queues approved Hirist jobs for your [Hirist agent](/docs/hirist-agent) (at most 15 a day). Career-page jobs are marked to apply on the company's site. |
| Add to my tracker | Puts the approved jobs on your [Tracker](/docs/tracker). |
| Pick DSA questions | Points you to [DSA Prep](/docs/dsa) for the companies in the run. |
| Write a recap of the run | One line on what happened. |

*Tailor my resume*, *Draft a cover letter*, *Research the company* and *Set up a mock interview* are placeholders for now: they're skipped with a note. Tailor resumes in [Resume Studio](/docs/resume-studio).

## Schedules

Each workflow runs **when you start it**, **every day** at a time, or **every week** on a day and time — in your time zone. A scheduled run shows only jobs that are **new since the last run**; a manual run shows everything that matches.

## Approving

When a run waits for you, it's at the top of **Automations** with every job's verdict, the reasons for and against, and the pay to ask for. Tick the ones to keep and click **Approve**, or **Cancel this run**.

With [Signal alerts](/docs/signal) set up, you also get a message with one-tap approve links.

Approving adds the tools those jobs ask for that aren't on your profile to your [Learn](/docs/learn) list.

## Watching a run

**Recent runs** shows every run step by step, with what each step found or did. A running run has a **Stop this run** button.

If the server restarts mid-run (it happens on deploys), the run picks up where it was within a few minutes; if a step ever takes over 6 minutes, it's stopped with a message so you can run it again.
