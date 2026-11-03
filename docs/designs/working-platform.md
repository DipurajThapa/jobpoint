# Working Platform and Email Kit

*   **Author:** Claude Code (for Dipuraj Thapa)
*   **Status:** Approved — Goldfish findings resolved (see `working-platform-review.md`)
*   **Date:** 2026-11-03

--------------------------------------------------------------------------------

## Overview

Job Point Consultancy needs an internal, web-based team area inside its existing
website. Authorised team members open `/platform`, sign in, and see a dashboard
listing only the tools they are permitted to use. The first and only tool in
this phase is **Email Kit**, the employer-outreach workspace previously shipped
as the standalone browser app "Usha 3.0".

This document records the current state (Step 1), the integration and data
decisions (Step 2), and the build plan (Steps 3 to 5).

## The Problem

The team's outreach records live in one browser profile per consultant. The
tool's own release notes warn that different devices hold different
Do-not-contact lists and that only one active workspace per agency is safe.
There is no access control beyond physical access to the device, and no way to
add or remove a team member. The website already runs on a platform with a
database and private file storage, so the records and the people who may use
them can be managed centrally, with the server enforcing who sees what.

## Current state (inspected 2026-11-03)

### Website

*   Next-compatible React app compiled by **Vinext** into a **Cloudflare
    Worker**, hosted on **OpenAI Sites** (`.openai/hosting.json`, project
    `appgprj_6accb67691708191b2f360cde6039913`). Bindings: D1 `DB`, R2
    `BUCKET`. No mail provider, no other third-party services.
*   SQL migrations in `drizzle/` are copied into `dist/.openai/drizzle` by
    `build/sites-vite-plugin.ts`; Sites applies them on publish. Local dev
    (`npm run dev`) uses a Miniflare D1 that starts empty (migrations are not
    applied automatically).
*   Identity today: **Sign in with ChatGPT** (SIWC). The Sites edge injects
    `oai-authenticated-user-*` headers; `lib/admin.ts` treats the single email
    `dipuraj.thapa@gmail.com` as the site owner. `/admin` (recruitment console)
    is owner-only. Locally, the vendored Sites plugin mocks SIWC as
    `seedy@sites.test`, which `lib/admin.ts` accepts only outside production.
*   The public site runs as a read-only demo (`lib/demo.ts`, `DEMO_MODE = true`).
    Public intake routes reject writes with HTTP 503.
*   Global headers (`next.config.ts`): `nosniff`, `X-Frame-Options: DENY`,
    `Referrer-Policy`, `Permissions-Policy`. `robots.txt` disallows `/admin`
    and `/api/`.
*   Deployment is done from the Sites control plane. This repository session
    has no Sites credentials, so nothing here can be published by the agent.

### Email tool (Usha 3.0)

*   Uploaded files: `Usha-3.0-Source.zip` (source, tests, verification),
    `Usha-3.0-App.zip` (the hosted PWA build), `Usha-3.0.html` (the standalone
    single-file build; its SHA-256 `3339b8e2…` is identical to the source's
    `standalone/usha-outreach-composer.html`), the 3.0 release review and a
    consultant-discovery test log. **None of the uploads contain client
    records.** They are the application, not its data.
*   Architecture: plain browser JavaScript, ~7,400 lines, built by
    `scripts/build.py` into one HTML file. Modules: `config.js` (HR rules and
    options), `library.js` (wording/templates), `rules.js` (drafting and
    validation), `engine.js` (records and lifecycle transitions; no UI),
    `store.js` (persistence), `records.js` and `ui.js` (interface),
    `backup.js` (encrypted backups), `pwa.js` (install/update).
*   **Storage:** each browser profile holds its own IndexedDB database
    `usha-records` (v1) with 12 record tables — `orgs, contacts, convs, msgs,
    events, tasks, meetings, facts, sources, suppressions, queue, meta` — plus
    `files` (attachments as data URLs) and `snapshots` (one daily copy, 7
    kept). A localStorage fallback exists. Sender details are in localStorage
    (`usha-sender`). Every change is one engine command producing a list of
    `{table, id, value|null}` changes, committed atomically with an optimistic
    revision check (`meta/rev`).
*   **Safeguards held in the engine:** Do-not-contact restrictions
    (`suppressions`) are never deleted, only marked `lifted` with a stated
    reason; restriction keys only grow; follow-up timing starts only on
    "Mark as sent"; opt-outs end only via documented opt-in; restore never
    removes restrictions; a backup from a different agency is refused.
*   **Backups:** `usha-backup-v1` = PBKDF2-SHA256 (600k) + AES-GCM over a JSON
    export of all tables plus attachments. The passphrase is never stored.
*   Limitation stated by its own README: "Operate a single active workspace
    per agency until a centrally shared system has been built and tested."
    Working Platform is that shared system.

### What this means for migration

The existing records live only in the browser profile(s) where Usha was used.
The server cannot read them. The only transfer path is the existing
**protected backup file**, created in the old app and restored into Email Kit
by a person who knows its passphrase.

## Goals

*   G1. `/platform` is the dedicated URL. Unauthenticated requests to any
    `/platform/*` page or `/api/platform/*` endpoint receive no internal data.
*   G2. Administrators invite team members, remove access, reset access and
    grant per-tool permissions from a web page.
*   G3. Every protected page, data request and action checks the session and
    the tool permission **on the server**.
*   G4. Email Kit keeps Usha's workflows, templates, rules, records,
    restrictions and history, with records stored centrally (D1 + R2) and
    shared by permitted team members.
*   G5. Existing Usha data can be migrated from a protected backup, with a
    verifiable count report and no silent loss.
*   G6. The dashboard is driven by a tool registry so a future tool is one
    registry entry plus its route.
*   G7. Public pages and the existing owner `/admin` keep working unchanged.
*   G8. Every platform screen works at 320 px wide and on desktop.
*   G9. Testing never contacts anyone: tests run against local Miniflare
    storage with fictional records, and external hand-offs (`mailto:`,
    WhatsApp, search links) are blocked in the browser tests.

## Open Questions

*   **Edge header stripping (deployment check).** `/platform/owner` and the
    existing `/admin` trust `oai-authenticated-user-*` headers. Confirm on the
    deployed site that a request carrying forged headers without a ChatGPT
    session is refused (curl with the header set → expect 404 on
    `/api/platform/owner`).
*   **Sites plan limits (deployment check).** PBKDF2 at 100,000 iterations
    needs roughly 30–60 ms CPU. If the Sites Worker plan enforces the 10 ms
    free-plan CPU limit, sign-in will fail with 503 and the iteration count
    must be revisited with the platform owner. Check by signing in once after
    publishing.
*   **Release gate (owner decision).** The public site is a read-only demo
    with open legal launch gates for personal data. Email Kit stores employer
    contact data centrally. The owner decides when real records may be
    migrated; nothing in the code blocks it.
*   **Large backups.** One restore is one commit capped at 20 MB of records
    (attachments travel separately). A larger backup is refused with a
    message; a chunked restore can be added if this ever happens.

## Non-Goals

*   Sending email or messages from the server. Email Kit stays a drafting and
    record-keeping tool; the consultant sends from their own mailbox.
*   Adding tools other than Email Kit, or moving `/admin` into the platform.
*   Email delivery of invitations or reset links (no mail provider exists).
    Links are shown once to the administrator to pass on.
*   SSO/OAuth for team members, multi-factor authentication (recorded as
    future work), multi-agency tenancy.
*   Re-implementing the engine's business rules on the server.

## Critical User Journeys

### CUJ 1: First administrator

*   **Given** a fresh deployment with no platform users.
*   **When** the site owner, signed in with ChatGPT, opens `/platform/owner`
    and creates an administrator account with a password.
*   **Then** that administrator can sign in at `/platform/sign-in`. Nobody
    else can use `/platform/owner` (non-owners get 404).

### CUJ 2: Invite, accept, use

*   **Given** an administrator signed in.
*   **When** they invite `rina@…` with Email Kit = Edit and send her the
    one-time link shown on screen.
*   **Then** Rina opens the link, sets her name and password, lands on the
    dashboard, sees one card (Email Kit), opens it and works.

### CUJ 3: Denied access

*   **Given** someone with the URL but no account, or a member without Email
    Kit permission, or a disabled member.
*   **When** they request `/platform`, `/platform/email-kit` or any
    `/api/platform/...` endpoint.
*   **Then** they are redirected to sign-in (pages) or receive 401/403 JSON
    (APIs), and no record, template, name or count is returned.

### CUJ 4: Remove access

*   **Given** a member with an open session.
*   **When** an administrator disables them or sets Email Kit to "No access".
*   **Then** their next request is refused. Disabling also deletes their
    sessions.

### CUJ 5: Account recovery

*   **Given** a member forgot their password.
*   **When** they use "Forgot password", which tells them to ask an
    administrator; the administrator creates a reset link.
*   **Then** the member sets a new password via the link (valid 24 h, single
    use); all their earlier sessions end. If every administrator is locked
    out, the site owner uses `/platform/owner` to issue an administrator
    reset link.

### CUJ 6: Migrate Usha data

*   **Given** a protected Usha 3.0 backup and its passphrase.
*   **When** a member with Email Kit **Manage** permission saves the same
    agency name under Agency setup, then restores the backup in Email Kit.
*   **Then** the engine's existing restore command validates every row
    (rejecting invalid rows, never removing restrictions), the commit is
    stored atomically, attachments are uploaded, and the screen reports
    added/updated/rejected counts. An administrator can compare those counts
    with the platform's record-count endpoint.

### CUJ 7: Daily Email Kit use by two people

*   **Given** two members with Edit access working at the same time.
*   **When** both act on records.
*   **Then** each command commits against the latest revision; if another
    person wrote first, the client reloads and re-runs the command (existing
    engine behaviour), so neither overwrites the other.

## Technical Plan

```text
 Browser                                     Cloudflare Worker (Vinext)                 Storage
 ───────                                     ──────────────────────────                 ───────
 /platform/sign-in  ──POST /api/platform/auth/sign-in──► verify PBKDF2, rate limit ──► D1 platform_users
                    ◄── Set-Cookie wp_session (HttpOnly, Secure, SameSite=Lax) ─────── D1 platform_sessions
 /platform (RSC page) ── requirePlatformUser() ─────────► session → user → tool grants  D1 platform_tool_access
 /platform/admin      ── requireAdmin() + /api/platform/admin/* ───────────────────────► D1 + audit_events
 /platform/email-kit  ── route handler: session + grant ─► Email Kit HTML (nonce CSP)
      Email Kit JS (engine, rules, UI unchanged) ── ServerStore ──►
          GET  /api/platform/email-kit/state       (view)   ───────────────────────────► D1 email_kit_records
          POST /api/platform/email-kit/commit      (edit/manage, rev-checked, guards) ─► D1 email_kit_state
          GET/PUT /api/platform/email-kit/files/:id (view / edit) ─────────────────────► R2 email-kit/files/*
          GET/POST /api/platform/email-kit/snapshots (view / edit) ────────────────────► R2 email-kit/snapshots/*
```

### Identity and sessions

*   Own accounts in D1 (team members may not have ChatGPT accounts). SIWC is
    used **only** for owner bootstrap and owner recovery at `/platform/owner`
    via the existing `isSiteOwner()`.
*   Passwords: PBKDF2-HMAC-SHA256, 100,000 iterations (the Workers WebCrypto
    maximum), 16-byte random salt, 32-byte output, stored as
    `pbkdf2-sha256$100000$<salt b64>$<hash b64>`. Length 12–200. Compare in
    constant time. Unknown emails still run one PBKDF2 derivation.
*   Sessions: 32 random bytes, base64url, sent as cookie `__Host-wp_session`
    on HTTPS (`wp_session` on plain-HTTP localhost), `HttpOnly; Path=/;
    SameSite=Lax; Secure` (Secure omitted only on http localhost). D1 stores
    the SHA-256 of the token. Idle timeout 12 h, absolute 7 days;
    `last_seen_at` refreshed at most every 5 minutes.
*   Every state-changing API checks `Origin` equals the request origin and
    `Sec-Fetch-Site` is not `cross-site` (existing `sameOrigin()`), and
    requires `content-type: application/json` (except the sign-out form post
    and file uploads, which still require same origin).
*   Rate limits (new generic limiter over the existing `rate_limits` table):
    sign-in 10 attempts / 15 min per IP-hash (`cf-connecting-ip` only) and
    20 / 15 min per email; token redemption 20 / 15 min per IP-hash; owner
    actions 10 / 15 min.
*   Sign-in response is identical for unknown email, wrong password and
    disabled account ("Email or password is incorrect.").

### Authorisation

*   Roles: `admin`, `member`. Status: `invited`, `active`, `disabled`.
*   Tool permission levels (per user, per tool, in `platform_tool_access`):
    `view` < `edit` < `manage`. Admins hold every tool at `manage`
    implicitly.
*   One server helper per surface:
    *   `requirePlatformPage(path)` → user or `redirect('/platform/sign-in?next=…')`.
    *   `requireToolPage(tool, min)` → user or redirect / 403 page.
    *   `authorizeApi(request, {tool?, min?, admin?, mutate?})` → user or a
        401/403 `Response`. `mutate` enforces the same-origin check.
*   Email Kit permission rules enforced inside `/commit`. Every commit names
    the engine command that produced it (`command`). A server table maps each
    command to a minimum level; an unknown command needs Manage:
    *   `view`: no commits, uploads or snapshot creation.
    *   `edit`: daily commands (`saveDraft`, `markSent`, `processResponse`,
        `reconcile*`, queue, meetings, facts, sources, rename/merge/verify,
        `liftRestriction`, `resolveReview`, `importContacts`, `setMandate`,
        `deleteConversation`, `deleteContact`, `dropDraft`, `undone`, `undo`).
    *   `manage`: `saveAgency`, `updateSettings`, `restore`, `migrateLegacy`,
        `eraseAll`; `eraseFiles`.
    *   Backstops independent of the declared command: writes to `meta` rows
        other than `rev` need a Manage command; deleting `events`, `msgs`,
        `convs`, `contacts`, `orgs` or `facts` is allowed only for
        `deleteConversation`, `deleteContact`, `mergeContacts`, `restore`,
        `eraseAll` and `undo`.
    *   **Trust boundary (stated plainly):** users with Edit access are trusted
        team members using the Email Kit client. The server guarantees
        identity, tool access, read-only View, Manage-only settings/restore/
        erase, the restriction guards below, row validity, and an audit trail
        with server-side identity. It does not re-run every business rule.
*   **Restriction guards** (server-side, independent of the client):
    *   Every incoming row passes the engine's own `Engine.validRow` (the same
        check a backup restore uses), loaded into the Worker from
        `engine.js`. Ids ≤ 80 chars, `value.id === id`, row JSON ≤ 256 KB,
        request ≤ 20 MB.
    *   New `suppressions` rows start `active` (`lifted` allowed only from
        `restore`). Allowed transitions: `active`→`lifted` with a non-empty
        `liftReason`; `lifted`→`active`.
    *   On an existing restriction: key lists (`nameKeys`, `contactKeys`,
        `companyKeys`) and `channels` may only grow; `scope` may change only
        from `review` (a human decision) or to `all`; `contactId` may change
        only when the old contact is deleted in the same commit (merge);
        `orgId` may change only from empty.
    *   Deleting or narrowing a restriction is refused, except by command
        `undo` from the same user who last wrote it within 15 minutes (the
        on-screen Undo of an opt-out). Audited.
    *   Deleting a contact requires each restriction linked to it to already
        hold the contact's name key and address keys.
    *   Audit (`audit_events.detail`): restriction lifted / decided / undone,
        manage commands, deletes with per-table counts.

### Admin capabilities

*   List users with role, status, last sign-in and tool levels.
*   Invite (email, name, role, tool levels) → user `invited` + 72 h invite
    link shown once. Re-issue invite. Create 24 h reset link. Change role,
    tool levels, disable/enable, delete. Guards: an admin cannot disable,
    demote or delete themself; the last active admin cannot be removed.
*   Recent platform audit events (latest 100).

### Email Kit packaging

*   Source lives in `tools/email-kit/src/` (upstream baseline committed
    first). A Vite plugin (`build/email-kit-plugin.mjs`) provides two virtual
    modules: `virtual:email-kit/page` (the assembled HTML, reproducing
    `build.py`'s substitutions, minus the font, manifest, service worker and
    meta CSP) and `virtual:email-kit/engine` (`engine.js` + `export { Engine }`
    for server validation). The deployed Worker contains both; no separate
    build step.
*   `store.js` is replaced by `server-store.js` with the same interface plus
    `access`, `readOnly`, `snapshotData(id)`. `mode` is `'database'` or
    `'failed'` (never `'document'`/`'none'`). 401/403 on load or commit sets
    `failed`, calls `onlost`, and shows a sign-in link.
*   `pwa.js` runs in page mode (no service worker, no install prompt).
*   The Jost font and its licence panel are removed; Email Kit uses Plus
    Jakarta Sans and the site's blue palette. The route injects a top bar
    (Working Platform, user name and access, Sign out form).
*   Per request the route inserts a nonce on each `<script` tag and sends
    `Content-Security-Policy: default-src 'none'; script-src 'nonce-…';
    style-src 'unsafe-inline' https://fonts.googleapis.com; font-src
    https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self';
    base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, plus
    `Cache-Control: no-store`.
*   Naming: user-facing "Usha" becomes "Email Kit". Stored identifiers stay:
    task owner / actor `'Usha'` (meaning "the system"), backup tag
    `app: 'usha'`, format `usha-backup-v1`. The UI shows the system actor as
    "Email Kit". Browser keys become `email-kit-*`; sign-out sends
    `Clear-Site-Data: "cache", "storage"`.
*   Shared use: the actor recorded in history is the signed-in user's name.
    Automatic reconcile no longer composes drafts (it still marks due and
    closes); the person who continues a due follow-up drafts it.
*   Access gating: elements carry `data-needs="edit"` or `"manage"` and are
    hidden below that level; View shows a read-only banner and skips
    reconcile, legacy migration, snapshot and file purge.
*   Attachments: `putFile` sends the data URL as JSON; R2 stores it as text
    (`email-kit/files/<id>`); `getFile` returns `{id, name, type, data}`.
    `deleteFiles(ids)` asks the server, which deletes only unreferenced files
    uploaded by the requester or older than 24 h.
*   Snapshots: `snapshot()` asks the server to build today's copy from D1
    (once a day). `snapshots()` returns `[{id, at}]`; `snapshotData(id)`
    fetches one. A commit deleting any contact or conversation deletes all
    snapshots (original privacy behaviour).

### API contracts (all JSON, `no-store`)

| Endpoint | Level | Request | Response |
|---|---|---|---|
| `GET /api/platform/email-kit/state` | view | — | `{rev, access, user:{id,name}, state:{<table>:{<id>:row}}}`; `state.meta.rev = {id:'rev', n: rev}` is synthesised |
| `GET …/revision` | view | — | `{rev}` |
| `POST …/commit` | edit+ | `{expected, command, changes:[{table,id,value\|null}]}` (`prev` stripped by client; client `meta/rev` row ignored) | `200 {rev}`; `409 {code:'STALE'}`; `403 {error, code}`; `413`; `422 {error}` |
| `GET …/files` | view | — | `{ids:[…]}` |
| `GET …/files/:id` | view | — | `{id,name,type,data}` or 404 |
| `PUT …/files/:id` | edit | `{name,type,data}` (data URL ≤ 7 MB) | `{ok}` |
| `POST …/files` | edit / manage | `{action:'delete', ids}` or `{action:'erase'}` (manage) | `{deleted}` |
| `GET …/snapshots` | view | `?id=` optional | list `{snapshots:[{id,at}]}` or `{id, at, data}` |
| `POST …/snapshots` | edit | `{today}` | `{created}` |
| `GET …/summary` | manage | — | `{rev, counts:{<table>:n}, files, snapshots}` |

### Data model (migration `drizzle/0002_working_platform.sql`)

```sql
platform_users(id PK, email UNIQUE, name, role, status, password_hash NULL,
  created_at, updated_at, last_sign_in_at NULL, created_by NULL)
platform_tool_access(user_id FK, tool_key, level, granted_by, granted_at,
  PRIMARY KEY(user_id, tool_key))
platform_sessions(token_hash PK, user_id FK, created_at, last_seen_at,
  expires_at, user_agent)
platform_tokens(token_hash PK, user_id FK, purpose 'invite'|'reset',
  created_by, created_at, expires_at, used_at NULL)
email_kit_records(tbl, id, data JSON, updated_at, updated_by, updated_rev,
  PRIMARY KEY(tbl, id))
audit_events + detail TEXT (ALTER TABLE)
email_kit_state(id = 1 PK, rev INTEGER, last_tx TEXT, updated_at, updated_by)
email_kit_files(id PK, name, type, size, r2_key, created_at, created_by)
email_kit_snapshots(id = 'YYYY-MM-DD' PK, r2_key, bytes, created_at, created_by)
```

`audit_events` (existing) records platform actions with
`actor_id = 'platform:<userId>'` or `'owner:<email>'`.

### Atomic, revision-checked commit on D1

D1 has no interactive transactions, but `db.batch()` runs as one transaction.
`/state` reads the revision and all rows in one batch. `/commit`:

1.  Validate and guard against the stored rows read in one batch.
2.  Batch: `UPDATE email_kit_state SET rev = rev + 1, last_tx = :token …
    WHERE id = 1 AND rev = :expected`; upserts `INSERT … SELECT
    json_extract(value,'$.t'), json_extract(value,'$.i'), json_extract(value,'$.d')
    … FROM json_each(:chunk) WHERE EXISTS (SELECT 1 FROM email_kit_state WHERE
    id = 1 AND last_tx = :token) ON CONFLICT(tbl,id) DO UPDATE`; deletes
    `WHERE EXISTS(… last_tx = :token) AND (tbl || char(31) || id) IN (SELECT
    value FROM json_each(:keys))`; audit rows with the same guard. Chunks
    ≤ 500 KB.
3.  If statement 1 changed 0 rows → `409 STALE` (nothing else was written,
    because every other statement is guarded by the fresh token). The
    client's existing `Store.Stale` retry re-runs the command on fresh state.

### Migration path (cut-over)

1.  Freeze: tell consultants to stop using the old app at an agreed time.
2.  In each old browser profile: Version and backup → passphrase → save the
    protected backup (the final backup per profile).
3.  In Email Kit (Manage): Agency setup → the **same agency name** → approve →
    save. Then Version and backup → choose the backup → passphrase → Restore.
    Decryption happens in the browser; rows go to the server over HTTPS in the
    authenticated session.
4.  Email Kit shows a reconciliation table per record type: in backup /
    stored identical / kept newer existing / not stored, and how many
    attachments failed. "Download rows not stored" saves them as JSON.
5.  Restore the next profile's backup (restore merges by id; restrictions are
    never removed). Review possible duplicates in Clients afterwards.
6.  Keep the encrypted final backups offline for at least 90 days. Never
    delete old data on matching counts alone.

### Files added or changed

*   `drizzle/0002_working_platform.sql`, `drizzle/meta/_journal.json`,
    `db/schema.ts` (tables above).
*   `lib/platform/{crypto,auth,tools,users}.ts`, `lib/email-kit/server.ts`, `lib/email-kit/virtual.d.ts`,
    `build/email-kit-plugin.mjs`, `vite.config.ts` (register plugin).
*   `app/platform/layout.tsx`, `platform.css`, pages: `page.tsx` (dashboard),
    `sign-in/`, `accept/`, `reset/`, `forgot/`, `account/`, `admin/`,
    `owner/`, `email-kit/route.ts`.
*   `app/api/platform/auth/{sign-in,sign-out,accept,password}/route.ts`,
    `app/api/platform/admin/users/route.ts`,
    `app/api/platform/admin/users/[id]/route.ts`,
    `app/api/platform/admin/users/[id]/link/route.ts`,
    `app/api/platform/owner/route.ts`,
    `app/api/platform/email-kit/{state,revision,commit,summary}/route.ts`,
    `app/api/platform/email-kit/files/route.ts`,
    `app/api/platform/email-kit/files/[id]/route.ts`,
    `app/api/platform/email-kit/snapshots/route.ts`.
*   `tools/email-kit/src/server-store.js` (new), edits to `index.html`,
    `ui.js`, `records.js`, `pwa.js`, `styles.css`, `rules.js`, `engine.js`,
    `config.js`, `library.js` for naming and platform mode.
*   `app/robots.txt/route.ts` adds `Disallow: /platform`.
*   `scripts/local-db.mjs` (apply migrations to the local Miniflare D1),
    `scripts/check-platform.mjs` (end-to-end browser + API test).

## Alternatives Considered

### A: Keep Usha local-only and link to it from the dashboard

*   **Pros**: no data migration, no server storage of client data.
*   **Cons**: no server-side permissions on data, each browser keeps its own
    restriction list (the documented risk of conflicting Do-not-contact
    lists), a hidden link is not access control.
*   **Rejected**: fails G1, G3 and G4.

### B: Use Sign in with ChatGPT for every team member

*   **Pros**: no password storage; recovery handled by OpenAI.
*   **Cons**: every team member needs a ChatGPT account; local testing relies
    on a single mocked identity; Sites access settings are outside this
    repository.
*   **Rejected** for members; kept for owner bootstrap/recovery.

### C: Rewrite Email Kit in React

*   **Pros**: one UI stack.
*   **Cons**: re-implementing ~7,400 lines and 215k verified scenarios risks
    losing safeguards; large untested surface.
*   **Rejected**: the engine/rules/UI are kept; only persistence and naming
    change.

## Non-Functional Requirements

*   **Security & privacy**: client data only leaves D1/R2 through
    authenticated, permission-checked endpoints with `no-store` caching.
    `/platform` and `/api/platform` are disallowed in robots.txt and marked
    noindex. Tokens and passwords are stored only as hashes. Audit events
    for sign-in, sign-out, invites, resets, permission changes, suppression
    lifts, restores and bulk deletes.
*   **Performance**: a single shared workspace for a small team; full-state
    load on open (expected well under 5 MB). Revision polling happens only
    before each command (existing behaviour).
*   **Rollout & rollback**: the migration only adds tables. Removing the
    `/platform` routes leaves the public site intact. Data remains in D1
    and can be exported as an Email Kit backup at any time.
*   **Release gate**: the site is currently a read-only demo with unresolved
    legal launch gates for personal data (README). Storing employer contact
    records centrally is a new processing activity; the owner must confirm it
    is covered before real records are migrated.

## Detailed Implementation Plan

1.  **Inspect and document** — this document; Email Kit baseline commit.
2.  **Data** — `drizzle/0002_working_platform.sql` (+ journal idx 2),
    `db/schema.ts`; `scripts/local-db.mjs` applies migrations to the local
    Miniflare D1 (tracked in `d1_migrations`).
3.  **Platform core** — `lib/platform/*`; auth, admin and owner APIs; pages
    `/platform`, `sign-in`, `forgot`, `accept`, `reset`, `account`, `admin`,
    `owner`; `app/platform/platform.css`; robots `Disallow: /platform`.
4.  **Email Kit** — rename, `server-store.js`, access gating, actor, reconcile
    change, restore reconciliation, packaging plugin, route and APIs, guards.
5.  **Verify** — see below; fix failures; update README and admin guide.

## Verification Plan

*   `npm run lint`, `npx tsc --noEmit`, `npm run build` (bundle check: no
    `seedy@sites.test` path reachable when `NODE_ENV` is production).
*   Existing checks: `scripts/check-demo.mjs`, `check-local-dummy-jobs.mjs`,
    `check-navigation.mjs`.
*   `scripts/check-platform.mjs` against `npm run dev` with a fresh local D1,
    fictional data only, external URLs blocked:
    *   CUJ1 owner bootstrap (mock SIWC), non-owner 404; CUJ2 invite → accept
        → dashboard shows only permitted tools; CUJ3 anonymous and
        no-permission requests to every `/platform` page and
        `/api/platform/*` endpoint return redirect/401/403 with no data;
        CUJ4 disable/revoke takes effect on next request; CUJ5 reset link,
        single use, old sessions end; password change; sign-out clears the
        session.
    *   Email Kit: agency setup, generate first draft, mark as sent, paste a
        reply and process it, opt-out + Undo, lift with reason, follow-up due
        after date change, attachment upload/download, backup export,
        restore of a backup produced by the original Usha 3.0 standalone
        build with the fictional test agency, reconciliation table, data
        persists across reload and across users, concurrent edits → 409 retry.
    *   Guards: each restriction bypass in review finding 1 is refused;
        View cannot commit; Edit cannot save settings/restore/erase.
    *   Mobile: 360 px screenshots of sign-in, dashboard, admin, Email Kit;
        no horizontal scroll.
    *   Public regression: `/`, `/jobs/<id>`, `/privacy`, `/terms`,
        `/compliance`, `/admin` (owner) still render; demo POSTs still 503.

## Review record

Goldfish reviewers (fresh context, EGM `design_critic`,
`implementation_readiness` and `zoom_out` personas) reviewed the first draft.
Their 3 Blockers and 21 Major findings were resolved and folded in above; the
finding-by-finding record is `docs/designs/working-platform-review.md`.
