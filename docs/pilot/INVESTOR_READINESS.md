# Investor readiness: what is done, what only you can do, and what it costs

The investor's verdict (11 November 2026) was **about 60% ready for a controlled launch and 35% ready for investment**. The threshold for investment is 85%, and features alone cannot reach it. What decides it is employer demand and repeatable profit: signed mandates, paid placements and a client that comes back.

The product now records every one of those conditions and measures them itself: owner console → **Pilot and investor**. Nothing on that page is typed in by hand. A condition shows "Met" only when the records prove it.

## What was done in the product (no cost)

| Investor point | What the product now does |
|---|---|
| Links on the live site do nothing | Fixed. The framework's link component crashed in production builds; every link now navigates, and a lint rule stops the broken component coming back. |
| One launch city, a narrow set of roles | The public site is Bengaluru only, with three role families: accounts and finance, sales and business development, customer support and operations. Other roles and cities are named as not covered. |
| Public promises exceed the evidence | "Every CV reviewed" and "confirmed by email" are gone. Replies are promised within two working days. Registration pages say sign-up is closed and point to the forms that work. |
| Paid Fast Track next to "free" | Not offered. A paid test can never change the ranking or what recruiters see when they choose. The terms say so. |
| The 60-day "lower priority" rule | Switched off. Early exits are still recorded and shown to recruiters, and are removed from public copy and the terms. |
| Publish only vacancies the employer authorised | Enforced. A role is published only for a client with a signed mandate, and with the name of the employer's authoriser and a date. Otherwise it is saved as a draft and you are told why. |
| Working email with delivery and failure visibility | Free providers built in (Brevo: 300 emails a day). Every attempt is logged with the outcome; there is a test-send button; every hiring update goes by email as well as to the inbox. |
| Weekly funnel: prospects → mandates → candidates → shortlists → interviews → joins → invoices → collections, recruiter hours, lead source | Built, with a CSV download for the investor pack. |
| Paid placements, collections, recruiter time and cost per hire | Invoices and payments recorded per placement; recruiters log time per job; direct costs are recorded. The page shows cost per hire and contribution per placement after recruiter time and costs. |
| Repeat client | Counted automatically: a client that posts a vacancy after its first placement. |
| A deployed end-to-end test | `scripts/live-check.mjs` runs the public half against the live site, and [DEPLOYED_TEST_RUNBOOK.md](DEPLOYED_TEST_RUNBOOK.md) is the signed-in half, as a checklist. |

## What only you can do (and it is free)

1. **Republish the site** so this code and migrations `0023` and `0024` go live.
2. **Switch on email:** 15 minutes, free ([EMAIL_SETUP.md](EMAIL_SETUP.md)). Then press **Send test**.
3. **Run the deployed test:** Part A (script) and Part B (runbook). Keep the filled-in table.
4. **Name the people:** who reviews every incoming CV (the investor asks for a named person), the privacy and grievance contact, and the incident owner. Put the names and the registered address in the privacy notice. It currently says "[registered address to be confirmed]".
5. **Win two mandates.** Work [PROSPECTS_BENGALURU_2026-11.md](PROSPECTS_BENGALURU_2026-11.md) with [OUTREACH.md](OUTREACH.md). Have the [mandate template](MANDATE_TEMPLATE.md) checked by a lawyer once, then sign it per client. Record each mandate and authorisation in the console, and publish only those vacancies.
6. **Deliver, invoice, collect.** Log recruiter time on every job from day one. Record each invoice and each payment.
7. **Weekly, export the funnel CSV** and send it to the investor with three lines: what worked, what did not, what changes next week.
8. **Compare the matching with real outcomes.** After 20 submissions, read 20 passes and 20 submissions with someone who knows the roles, and note where the ranking and the recruiter disagreed. That is the evidence for, or against, "the matching is an advantage".

## What it costs

| Item | Free option | Note |
|---|---|---|
| Email | Brevo free (300 a day) or Resend free (3,000 a month) | Enough for the pilot |
| Hosting | The current hosting | Unchanged |
| Prospect lists | Indeed search (used here), LinkedIn free search, company websites | |
| Mandate template | Provided here | A lawyer's one-time review is the only cost we recommend paying |
| WhatsApp updates | Messages are queued, not sent, until a provider is connected | Not needed for the pilot: email and phone are enough |

## How readiness moves

| Stage | Evidence that moves it | Investor's figure |
|---|---|---|
| Today | Software, audits, this pack | 60% launch, 35% investment |
| Pilot allowed | Live checks pass, email works, named owners, privacy contact and address published | about 70% launch |
| Investable | 2 or more signed mandates and verified jobs live; deployed test passed; several paid placements with fees collected, and cost per hire known; one client back with a second vacancy | 85% investment |

The Pilot and investor page shows the last row's conditions as met or not yet, from the records.
