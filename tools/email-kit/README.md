# Email Kit

Email Kit is the Job Point team's employer-outreach workspace inside
[Working Platform](../../docs/WORKING_PLATFORM_ADMIN_GUIDE.md). It prepares
first emails, replies and follow-ups, keeps each employer conversation's
history, and enforces Do not contact restrictions. It never sends anything.
Consultants send from their own mailbox or WhatsApp, then choose
**Mark as sent**.

Email Kit was released as the standalone browser app **Usha** (up to 3.0.0;
see [UPSTREAM_README.md](UPSTREAM_README.md) and
[CHANGELOG.md](CHANGELOG.md)). This edition (3.1.0) keeps Usha's drafting
rules, templates, lifecycle engine and safeguards. What changed:

| | Usha 3.0 (standalone) | Email Kit 3.1 (Working Platform) |
|---|---|---|
| Where records live | IndexedDB in one browser profile | Job Point D1 database (records) and private R2 (attachments, daily recovery copies) |
| Who can open it | Anyone with the device | Signed-in team members with Email Kit access (View, Edit or Manage) |
| Do not contact list | Per device | One shared list. The server refuses deleting, narrowing or moving a restriction; lifting needs a stated reason and is audited |
| History "recorded by" | Typed sender name | The signed-in person |
| Background follow-up drafts | Drafted with that device's sender details | Not drafted in the background. The person who continues a due follow-up drafts it with their own details |
| Install / offline | Installable PWA, offline | Runs inside the website, needs a connection; nothing is cached on the device |
| Restore | Counts added / updated / rejected | Also shows a per-record-type check of every backup row, with a download of rows not stored |

## Moving records from Usha

Records from the old app exist only in the browser profiles where Usha was
used. They move through Usha's protected backup file.

1. **Freeze.** Agree a time after which nobody uses the old app.
2. **Final backup per profile.** In each browser that used Usha, open
   *App, updates and backup*, enter a passphrase of 12 or more characters, and
   choose **Save a backup**. Keep the passphrase separately.
3. **Agency profile.** In Email Kit (Manage access), open **Agency setup** and
   enter the **same agency name** used in Usha. Fill in and approve the
   profile, then save. A backup from a different agency name is refused.
4. **Restore.** Open *Version and backup*, enter the backup's passphrase,
   choose **Restore a backup** and select the file. Decryption happens in your
   browser. The records go to the server over HTTPS in your signed-in session.
5. **Check.** Email Kit shows a table for each record type: *In backup*,
   *Stored as in backup*, *Kept newer saved version*, *Not stored*, plus how
   many attachments were stored. *Not stored* should be 0. If it is not, use
   **Download rows not stored** and review those rows; they are usually
   invalid, or messages whose conversation is missing.
6. **Next profile.** Repeat steps 4–5 for each backup. Restoring merges by
   record id and never removes a restriction. Afterwards, review possible
   duplicate people under **Clients**.
7. **Keep the backups** offline for at least 90 days. Do not delete old data
   on matching counts alone; first check the records in Email Kit.

A wrong passphrase changes nothing. Restoring the same backup twice is harmless.

Administrators can call `GET /api/platform/email-kit/summary` (Manage) for
record counts per type.

## Daily use

Unchanged from Usha, except:
- Sign in at `/platform` and open **Email Kit**.
- The bar at the top shows your access level. **Sign out** ends the session and
  clears Email Kit data kept in this browser.
- Several people can work at once. If someone else saved first, Email Kit
  reloads the latest records and repeats your step, so nobody overwrites
  anybody.

## Source and build

- `src/` holds the app: `config.js` (rules and options), `library.js`
  (wording), `rules.js` (drafting and checks), `engine.js` (records and
  lifecycle), `server-store.js` (Working Platform storage, which replaces
  `store.js`), `records.js` / `ui.js` (interface), `backup.js` (encrypted
  backups), `pwa.js` (version panel, page mode).
- `build/email-kit-plugin.mjs` assembles the page at build time. The page is
  served only by the authenticated route `app/platform/email-kit/route.ts`,
  with a per-request script nonce and a strict Content Security Policy.
- The server endpoints live under `app/api/platform/email-kit/`, and the
  storage and guards under `lib/email-kit/server.ts`. The server reuses the
  engine's own `validRow` checks on every saved record.
- Stored identifiers kept for compatibility: the system actor `'Usha'`
  (shown as "Email Kit"), the backup tag `app: 'usha'`, the backup format
  `usha-backup-v1`, and calendar UIDs `…@usha.local`.
- The upstream Usha test suite (`docs/upstream-verification/`) ran against the
  standalone build. This edition is covered by `scripts/check-platform.mjs`.
