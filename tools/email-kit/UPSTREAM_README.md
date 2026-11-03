# Usha 3.0

A local-first employer outreach workspace for agencies recruiting permanent, non-IT white-collar roles in India. The consultant reviews the draft, sends it using their own account and records the outcome. No subscription or API credentials are needed for the application itself.

## First session

1. Open the standalone HTML in a regular browser profile, or open the installed web edition. Keep the file location or hosted origin stable. Use a dedicated browser profile for each agency.
2. Open **Agency setup**. Enter your name as it should appear to prospects, describe how you actually screen candidates and set a review date. Only add client names you can publicly reference. Put approved fee, payment and replacement conditions on separate lines. Approve the scope and save.
3. Under **Your details**, enter the individual sender. Enter a prospect, their organisation and a documented reason to contact them. A job posting can establish relevance. Review source, context and eligibility before sending. Research links open an external service.
4. Generate a first email. A draft creates history. The follow-up clock starts only after you send it yourself and choose **Mark as sent**. Opening an external app or copying a draft proves no delivery.
5. Use **Clients → Next actions → Continue**. Paste a reply, check the suggested category, answer any missing question and review its next action. Confirm the actual date, time and time zone before confirming a meeting. Download and import the calendar file if a reminder is needed while Usha is closed.
6. Check **Do not contact** before resuming any conversation. A stop request can apply to a person, a channel or an organisation. Mixed wording stays on hold for human review. For WhatsApp, enter the destination in international format and record the recipient’s permission source and date. Reconfirm after changing destination.
7. When an employer qualifies an opportunity, open its conversation in **Clients → Clients**, select **Record mandate stage**, enter the stage and its supporting reference. Won or lost closes active outreach. Record the outcome of any confirmed meeting first. Use the CSV to hand off the conversation ID, next owner, next action, hiring need and mandate reference.
8. Make a protected backup from **Version and backup**. Keep its passphrase separately. To restore a 3.0 backup into a fresh profile, first set up the same named agency. Restore an unlabelled 2.0 backup in a fresh profile before onboarding. The app deliberately retains restrictions when deleting contact histories. Folder ZIPs, CSVs and email files are readable exports. Delete obsolete exports from their separate storage locations.

## Existing installation

For a hosted installation, use the same HTTPS origin, path and manifest ID. Replace the contents of the hosting project with the new dist files. A different origin has separate storage. Back up first. On upgrading, approve your agency’s own identity and claims. Older drafts remain visible in history and require regeneration before handoff. The standalone page does not install an automatic updater. If moving a standalone file or changing browser, transfer records through backup and restore.

## What is local

Records, due actions, suppression, approved agency settings and attachments live in this browser. The encrypted downloaded backup does not encrypt IndexedDB or your readable exports. Protect the device and browser profile. A different device has an independent restriction list. Operate a single active workspace per agency until a centrally shared system has been built and tested. Do not alternate sends from restored copies. This edition provides manual email and messaging handoff, local reminders and calendar exports. It does not source a verified prospect list, send automatically, confirm deliverability or sync an inbox, CRM or live calendar.

## Build and verification

Run Python 3 and Node.js. Browser tests require Playwright and its matching Chromium, or a verified compatible executable. Run the commands from the repository root.

    python3 scripts/build.py
    node tests/matrix.js
    node tests/variants.js
    node tests/flows.js
    node tests/records.js
    node tests/pwa.js
    node tests/release3.js

For an actual prior-release upgrade, supply an extracted, previously distributed dist directory:

    USHA_PREVIOUS_DIST=/absolute/path/to/previous/dist node tests/upgrade_real.js

The build produces dist for static hosting and standalone/usha-outreach-composer.html for local use. The included test agency is fictional and only loaded by test fixtures. Keep private commercial claims out of source code, static assets and test fixtures.

## Replication

Per-agency changes belong in Agency setup. A different vertical needs a separately reviewed edition. config.js supplies the HR rules and options, library.js supplies wording, rules.js builds and validates drafts, engine.js manages records and transitions, and ui.js / records.js present them. engine.js still contains recruitment-specific assumptions. Begin a new edition by mapping its actual events and acceptance tests, then separate those assumptions before sharing the engine. See the supplied release review for worked examples.

Bundled Jost font licence and attribution are in assets/jost-OFL-LICENSE.txt and the distributed app’s Font licence panel.

Optional accessibility smoke test: install axe-core locally, then run node tests/accessibility.js. Evidence for the tested build is under docs/verification, with outputs for UI flows, real-date lifecycle scenarios, application updates, backups and release-specific controls. Screen-reader use and physical-device notification delivery remain field checks.
