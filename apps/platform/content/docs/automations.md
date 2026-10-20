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
| Tailor my resume | Tailors your [Resume Studio](/docs/resume-studio) resume to each job's full description (at most 5 by default), with the AI key saved under **AI for tailoring**. Put it **after** *Wait for my approval*, so only the jobs you approve are tailored. See [Tailored resumes](#tailored-resumes). |
| Apply on Hirist | Queues approved Hirist jobs for your [Hirist agent](/docs/hirist-agent) (at most 15 a day). Career-page jobs are marked to apply on the company's site. |
| Add to my tracker | Puts the approved jobs on your [Tracker](/docs/tracker). |
| Pick DSA questions | Points you to [DSA Prep](/docs/dsa) for the companies in the run. |
| Write a recap of the run | One line on what happened. |

*Draft a cover letter*, *Research the company* and *Set up a mock interview* are placeholders for now: they're skipped with a note.

## Tailored resumes

1. **Save an AI key once.** On the Automations page, **AI for tailoring** → pick a provider (Gemini has a free tier: [get a key](https://aistudio.google.com/apikey)) → paste the key → **Check & save**. If Resume Studio in this browser already has a key, click **Use that key**. It's checked, then stored encrypted. A workflow running at 9 AM can't use the key in your browser, which is why it needs its own copy.
2. **Add your resume in [Resume Studio](/docs/resume-studio)** if you haven't. That's the resume that gets tailored; it isn't changed.
3. **Put *Tailor my resume* after *Wait for my approval*** in your workflow (edit the workflow and drag it below). The *At most* setting caps how many resumes one run makes (5 by default).
4. **Run it and approve.** For each approved job, Offerloop reads the posting's full description and runs the same steps as Resume Studio: analyse the job, draft edits, a recruiter review, and the honesty checks against your profile. Each resume takes about 3 AI requests and a minute or two.
5. **Review.** Open the run on the Automations page → **Tailored resumes**. Each job has a tab: the job description on the left, the tailored resume on the right with the edits highlighted, the ATS match before → after, every change with its reason, the recruiter's notes, and the skills the job asks for that your resume can't show. **PDF** downloads it; **Edit in Resume Studio** opens that version to accept, reject or change edits.

Every tailored resume is also a version in Resume Studio's version list. A job whose description can't be read, or that hits the AI's rate limit twice, is marked "Couldn't tailor" with the reason; the others carry on, and so does the rest of the run.

With **Apply on Hirist** after *Tailor my resume*, the [Hirist agent](/docs/hirist-agent#apply-with-each-job-s-tailored-resume-optional) can apply to each job with its tailored resume (one-time setup on your PC). Use the PDFs too where you apply on a company's site, or send them to recruiters.

## Schedules

Each workflow runs **when you start it**, **every day** at a time, or **every week** on a day and time — in your time zone. A scheduled run shows only jobs that are **new since the last run**; a manual run shows everything that matches.

## Approving

When a run waits for you, it's at the top of **Automations** with every job's verdict, the reasons for and against, and the pay to ask for. Tick the ones to keep and click **Approve**, or **Cancel this run**.

With [Signal alerts](/docs/signal) set up, you also get a message with one-tap approve links.

Approving adds the tools those jobs ask for that aren't on your profile to your [Learn](/docs/learn) list.

## Watching a run

**Recent runs** shows every run step by step, with what each step found or did. A running run has a **Stop this run** button.

If the server restarts mid-run (it happens on deploys), the run picks up where it was within a few minutes; if a step ever takes over 6 minutes, it's stopped with a message so you can run it again.
