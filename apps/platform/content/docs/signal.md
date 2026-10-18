---
title: Signal alerts
description: Get a Signal message when a workflow is waiting, and approve with one tap.
order: 22
section: Apply
---

When a workflow stops at **Wait for my approval**, Offerloop can send you a Signal message with the best jobs and one-tap links:

```text
Offerloop: Apply on Hirist found 8 jobs, waiting for your approval.

1. AI Engineer - Tredence (74%, Good fit)
2. AI Platform Engineer - KreditBee (71%, Good fit) | new: CrewAI, MCP
...
APPROVE ALL 8: https://…/a/…
Approve #1 only: https://…/a/…
Skip this run: https://…/a/…
Pick on the site: https://…/automations
```

It uses [CallMeBot](https://www.callmebot.com)'s free Signal relay (for personal use).

## Set it up (5 minutes)

1. On your phone, open **callmebot.com → Signal**, save the bot's number to your contacts, and send it in Signal:

   ```text
   I allow callmebot to send me messages
   ```

2. Within a few minutes the bot replies with an API key and a link like `https://signal.callmebot.com/signal/send.php?phone=c242bb7d-…&apikey=123456&text=…`
3. In Offerloop, open **Automations → Signal alerts** and paste the `phone=` value (often an id like `c242bb7d-…`, not your phone number) and the `apikey=` value. Click **Save**.
4. Click **Send a test**. A message should arrive within a minute.

## Approving from the message

Tap a link and a small page opens showing exactly which jobs it covers, with one **Approve** button (or **Skip this run**). No login needed — the link itself is the permission.

- A link only ever does something when you tap the button, never just by being opened (messengers open links to build previews).
- Links work for that one run, for 24 hours. Once the run is approved or skipped — by link or on the site — all its links stop working.

## When a message doesn't arrive

The **Signal alerts** card shows how the last message went and CallMeBot's reply:

- **Failed — Internal Signal Error:** CallMeBot sometimes can't deliver long messages; Offerloop automatically sends a short version instead (job count, an Approve all link and the site link).
- **Failed — APIKey invalid / not activated:** check the values you saved; if you messaged the bot only minutes ago, wait and try again.
- A waiting run has **Resend approval message** on the card.

## Privacy

CallMeBot relays the message, so it can read it — including the links. That's why messages carry only job titles, companies and links, never passwords or keys. In theory, someone who saw a message could approve that run's jobs within 24 hours, and nothing else. Your CallMeBot key is stored encrypted. Click **Remove** on the card to turn alerts off.
