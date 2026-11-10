# Architecture, data and tenant-isolation audit — 10 Nov 2026

Scope: repository structure, SDLC hygiene, database design, data flow, and
company/candidate isolation. Method: read the schema, all 13 migrations, every
API route's auth guard, and the query layer (`lib/portal`, `lib/platform`,
`app/api`). Nothing was run against a live database, and nothing was changed.
Items marked **(verify)** depend on deployment settings I cannot see from the code.

## 0. Verdict

**Tenant isolation is well built; the data model and repo structure are not.**

- Every company-facing query is scoped by `company_id`. I found no path where one
  company reads another's pipeline, interviews, placements, team, notices or JDs.
  Recruiter/team scoping (`lib/portal/staff.ts`) returns "not found" outside scope.
  Candidates only ever query by their own `candidateId`.
- The real risks are (1) a suspended company keeps working access, (2) erasure is
  incomplete because one person's data lives in two parallel stores, and (3) the
  system has several duplicated sub-systems that will drift apart.

## 1. Findings, ranked

### Security / privacy

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | **High** | **Suspended or closed companies keep full access.** `accountFromToken` loads `companyStatus` but nothing checks it. A suspended client can still read the pipeline, view candidate profiles and download watermarked CVs. | `lib/portal/accounts.ts:77`, `lib/portal/session.ts` `requireApi`/`requirePage` (no status test) | In `requireApi`/`requirePage`, reject `kind=company_user` unless `companyStatus='active'`. Revoke open sessions when status changes. |
| S2 | **High** | **Erasure is incomplete.** `deleteCandidateData` removes CVs, pipeline, applications, messages, attempts, orders, but leaves `matches`, `adaptive_tests/answers`, `candidate_commitments`, `fast_track_orders`, `candidate_sources`, `shortlist_passes`, `duplicate_flags`, `ats_screenings`. The candidate row survives as a stub, so FK cascades do not fire until `purgeExpiredStubs` removes it a year later. Audit `detail` strings also hold emails (`client.invited`, `client.member_invited`). | `lib/portal/candidate.ts` `deleteCandidateData`; `drizzle/0005,0011,0012` | Make deletion a single table-driven routine (list every table that has `candidate_id`). Add a test that fails when a new table with `candidate_id` is not in that list. Stop writing emails into audit `detail`. |
| S3 | **High** | **The same person is stored twice and erased once.** A website applicant becomes `applications` + a `candidates` row (+ second CV copy in R2 `portal-cv/`). A portal sign-up is a *different* `candidates` row (website applicants are deliberately never attached to portal accounts). Deleting one leaves the other. | `lib/portal/website.ts` header comment; `app/api/applications/route.ts` | Resolve identity once (see D1). Until then, privacy-request completion must trigger deletion in both stores by email. |
| S4 | Med | **Privacy requests are not linked to data.** `privacy_requests` holds only an email; "completed" does not delete anything. Erasure is a manual, separate action. | `db/schema.ts` `privacyRequests`; `app/api/admin/privacy-requests/[id]/route.ts` | Add `candidate_id` / `application_id` to the request and run the erasure routine from the same admin action. |
| S5 | Med | **Three unrelated sign-in systems.** (a) Owner = trusts `oai-authenticated-user-*` headers, email hard-coded in `lib/admin.ts`; (b) staff = `platform_users` + `wp_session` cookie; (c) clients/candidates = `portal_accounts` + `jp_portal` cookie. Portal admin APIs (`/api/admin/portal/*`) accept **only** the owner, so a platform admin cannot do them. No 2FA anywhere (listed as a known gap in `docs/SECURITY.md`). | `lib/admin.ts`; `lib/platform/auth.ts`; `lib/portal/session.ts` | One staff identity (platform admin) for all admin APIs; owner header becomes a bootstrap/recovery path only. Add TOTP for admin and manager roles. |
| S6 | Med | **Owner-header trust and dev bypass (verify).** Owner access relies on the host stripping client-sent `oai-authenticated-*` headers. `seedy@sites.test` and a hard-coded portal secret apply whenever `NODE_ENV !== "production"`. If the built Worker does not set `NODE_ENV=production`, predictable candidate refs and a test-owner login become live. | `lib/admin.ts`; `lib/portal/session.ts:portalSecret` | Fail closed: require an explicit `ALLOW_DEV_AUTH=true` binding instead of inferring from `NODE_ENV`. Confirm the Worker is not reachable directly (workers.dev) with spoofable headers. |
| S7 | Med | **One secret serves two jobs.** `PORTAL_SECRET` falls back to `PLATFORM_SECRET_KEY`, which is also the AES key for stored integration tokens. | `lib/portal/session.ts`, `lib/platform/integrations.ts` | Separate keys; rotate once. |
| S8 | Low | **No CSP or HSTS.** Only nosniff, frame DENY, referrer and permissions policies are set. | `next.config.ts` | Add `Content-Security-Policy` and `Strict-Transport-Security`. |
| S9 | Low | **Account enumeration at sign-up** (`EMAIL_TAKEN` 409). Registration is closed in production, so low today. Sign-in and reset are already generic. | `lib/portal/accounts.ts:createAccount` | Return a neutral message and email the existing owner. |
| S10 | Low | **Weak spots in logic that leans on audit rows.** The "3 requirement edits per 30 days" limit counts `audit_events` rows by parsing `detail LIKE 'was live%'`. Deleting audit rows or changing wording silently disables the control. | `lib/portal/company.ts:118` | Use a dedicated counter column. |
| S11 | Low | **Dangling staff references.** `jds.recruiter_id`, `shortlist_passes.staff_id` and `pipeline.created_by` store staff ids without foreign keys. Deleting a platform user leaves jobs assigned to a ghost, visible only to managers/admin. | `drizzle/0008`, `0011`; `app/api/platform/admin/users/[id]/route.ts` DELETE | Clear `recruiter_id` on user delete (as `removeTeamMember` already does) or add FKs. |
| S12 | Info | **Candidate PII is shared across teams by design.** A recruiter in team A sees the full ranked candidate pool for jobs in team A; franchises do not have separate candidate pools. Confirm this is intended for franchise teams. | `lib/portal/staff.ts:staffCandidates` | Decision, not a bug. |

Verified safe: company → pipeline/interview/placement/team/notice/JD scoping; candidate hide-from-employer enforcement at submission; one-time test and commitment tokens (hashed, single-purpose, rate limited); CV downloads (watermark, contact stripping before offer, DOCX never handed out); CSRF origin checks on mutating routes; session cookies (`__Host-`, HttpOnly, hashed tokens); admin routes all guarded; no secrets committed (`.env*` ignored).

### Database and workflow unification

| # | Finding | Why it matters | Recommendation |
|---|---|---|---|
| D1 | **Two candidate stores.** `applications` (website, owner admin console) vs `candidates` + `cvs` + `cv_profiles` (portal). Name, email, phone, location, skills, status and notes live in both. Admin edits `applications.email` but `candidates.dedupe_email_hash` and the parsed profile are not updated; profile corrections in the portal never reach `applications`. | Same fact updated in two places; stale or contradictory records. | Make `candidates` the single person record. Keep `applications` only as a *submission event* (who applied to which job, when, with what form text), with no copied person fields; read person data via `candidate_sources`. |
| D2 | **Two job tables.** `jobs` (public site) vs `jds` (client JDs). A website application targets `jobs.id`; the pipeline works on `jds.id`. There is no link, so website intake and recruiter pipeline cannot join. | Candidates applying to a public job never enter the placement workflow for the same vacancy. | Retire `jobs`; publish a `jds` row (status `live`) to the public site, with a `public` flag and public-safe fields. |
| D3 | **Three "status/stage" systems for one hiring journey.** `applications.status` (12 values), `portal_applications.status` (10), `pipeline.stage` (10), each with its own event table (`pipeline_events`, `portal_application_events`, none for `applications`). | The same candidate can be "interview" in one and "new" in another. `moveStage` already hand-syncs two of them. | One pipeline table is the source of truth; derive the others (views) or drop them. |
| D4 | **Two scoring engines.** `lib/ats/score.ts` + `ats_screenings` (owner-only screening) vs `lib/portal/match.ts` + `matches` (portal). Different weights, different requirement formats (`ats_job_profiles` vs `jds.requirements`). | Two answers to "is this person a fit", neither authoritative. | Keep the portal engine; port ATS screening to read `matches`/`jds`; keep `lib/ats` only for parsing. |
| D5 | **Two assessment systems.** `assessments` / `assessment_items` / `assessment_attempts` / `assessment_responses` (0005) vs `question_banks` / `bank_questions` / `adaptive_tests` / `adaptive_answers` (0012). Both are live: candidate API serves both; `views.ts` reads the old one for client previews. | Duplicate question content and results; two admin UIs. | Pick the adaptive system; migrate or retire the old tables. |
| D6 | **Payments/orders in three shapes.** `payment_intents` (stub), `service_orders`/`service_enrolments`, `fast_track_orders` (manual). | Money-adjacent data with no single ledger. | One `orders` table with a `kind`. |
| D7 | **Notifications in four places.** `candidate_messages`, `company_notices`, `outbound_messages`, plus Email Kit conversations. | Duplicate delivery logic and no delivery history per person. | One `messages` table with recipient kind and channel. |
| D8 | **Three audit/log tables with inconsistent actors.** `audit_events`, `access_log`, `pipeline_events` (+ `portal_application_events`). Actor ids are written as raw ids, `staff:ID`, `platform:ID`, `admin:ID`, `company:ID`, `candidate:ID` and the SIWC user id. | Cannot answer "everything this person did" with one query. | One `audit_events` with `actor_kind` + `actor_id` columns; keep `access_log` only if it has a separate retention rule. |
| D9 | **Three employer lists.** `employer_enquiries` (website leads), `companies` (clients), Email Kit employer records (JSON blobs in `email_kit_records`). No link between a lead, the client it becomes and the outreach history. | Same company recorded up to three times with different spellings. | Add `companies.source_enquiry_id`; give Email Kit a `company_id` reference. |
| D10 | **Schema source of truth is split.** `db/schema.ts` models 14 tables; the migrations create ~70. 0003–0012 are raw SQL only, used through `prepare()` in ~48 files; only 9 files use Drizzle. `drizzle/meta/` has no snapshots, so `npm run db:generate` cannot diff correctly. | The documented workflow does not work; the type layer lies about the database. | Choose one: finish Drizzle (model all tables, regenerate snapshots) or drop Drizzle and keep hand-written migrations plus a typed query module. Stop mixing. |
| D11 | **Unenforced integrity.** Many references are plain text with no FK: `releases.candidate_id/company_id`, `unlocks.candidate_id`, `candidate_commitments.pipeline_id`, `adaptive_tests.bank_id`, `matches.cv_id`, `service_orders`, `duplicate_flags.a_id/b_id`. Statuses are enforced by CHECK in SQL but redefined separately in TypeScript, and `applications` statuses are TypeScript-only. | Orphans after any partial failure; drift between SQL and code. | Add FKs in a table-rebuild migration; generate TS union types from one list. |
| D12 | **`candidate_ref` is the only join between company data and candidates.** It is an HMAC of `companyId:candidateId`, which is good, but a candidate merge keeps the old ref (the duplicate's) on `unlocks`, so the same person can appear under two refs to one company. | Duplicate pipeline entries after merge. | On merge, rewrite `candidate_ref` for that company or keep a ref alias table. |

### Repository structure and SDLC

| # | Finding | Recommendation |
|---|---|---|
| R1 | **Four route trees for four audiences with overlapping names:** `/admin` (owner), `/platform/admin` (platform admin), `/portal` (auth pages for both clients and candidates), `/company`, `/candidate`. `/commit` and `/test` are one-time-link pages with generic names. | Group by audience: `(public)`, `(candidate)`, `(client)`, `(staff)`; move one-time-link pages under `/l/commitment` and `/l/test`. |
| R2 | **`lib/` mixes domains.** `lib/portal/` (35 files) holds candidate, client, staff, matching, assessment and notification logic; `lib/ats`, `lib/platform`, and ~10 loose files (`admin.ts`, `http.ts`, `demo.ts`, `landing.ts`, `site.ts`…). Two copies of `json`, `sameOrigin`, `newId`, `nowIso`, `audit`, rate-limit code (`lib/http.ts`, `lib/portal/session.ts`, `lib/portal/db.ts`, `lib/platform/auth.ts`). | One `lib/core` (http, ids, time, audit, rate limit, crypto), then `lib/domains/{candidates,clients,staff,matching,assessments,notifications,platform}`. |
| R3 | **No automated test or CI.** No `test` script, no `.github/`. The 11 `scripts/check-*.mjs` are manual and several need a running dev server. | Add `npm test` (unit: matching, consent, scoping) and a CI workflow running lint, type-check, migrations on SQLite, and the tenant-isolation tests below. |
| R4 | **Build artefact and tooling noise committed:** `tsconfig.tsbuildinfo` (216 KB, tracked), three install scripts (`npm-install.mjs`, `pnpm-install.mjs`, `install-ci.*`, `install-pnpm.sh`) while `.npmrc` + `package-lock.json` imply npm only, `build/` vendor plugins, `package.json` name still `site-creator-vinext-starter`. | Untrack `tsbuildinfo`; delete unused installers; rename the package; move `scripts/connector-preview` and `build/connector-preview-*` out if unused. |
| R5 | **Docs overlap and have rotted.** README says migrations stop at `0006` and omits most tables; `lib/portal/match.ts` cites `docs/PORTAL_MATCHING.md`, which does not exist (the file is `docs/research/portal-matching-design-2026-11-09.md`); the README still lists the Dummy-job demo behaviour; 8 top-level docs plus `designs/`, `research/`, `verification/` have no index or status. | Keep README short; one `docs/README.md` index with status (current / historical); generate the table list from migrations; archive point-in-time audits. |
| R6 | **Branding and identity drift:** README titled "Jobboard300", code/migrations/repo "job_point", "Job Point"; owner email hard-coded in code and docs. | Pick one name; move the owner email to a binding. |
| R7 | **Dead or mode-gated code.** The self-service marketplace (browse, unlock, quota, plans, `payment_intents`) stays behind `CLIENT_SELF_SERVICE`; migration 0010 already forces every JD to `managed`. | If the placement-fee model is final, remove self-service paths and tables; otherwise document the flag as a supported mode with tests. |

## 2. Proposed target structure

```
app/
  (public)/    home, jobs, employers, job-seekers, legal pages, l/{test,commitment}
  (candidate)/ candidate/*
  (client)/    company/*
  (staff)/     platform/*  (recruiting, assessments, email-kit, admin)  ← single staff area; owner console folded in
  api/{public,candidate,client,staff}/…
lib/
  core/        http, ids, time, audit, rate-limit, crypto, db
  domains/     candidates, clients, staff, matching, assessments, notifications, platform
db/
  migrations/  single source; typed query module or full Drizzle schema
docs/          README index, architecture, security, runbooks, archive/
tests/         unit + isolation + migration
```

## 3. Target data model (one record per real-world thing)

| Entity | Single table | Replaces |
|---|---|---|
| Person (candidate) | `candidates` (+ `cvs`, `cv_profiles`) | `applications` person fields |
| Application event | `applications` (candidate_id, jd_id, source, form_text) | `portal_applications`, `applications` status |
| Hiring journey | `pipeline` + `pipeline_events` | `applications.status`, `portal_applications.status` |
| Vacancy | `jds` (+ `public` flag) | `jobs`, `ats_job_profiles` |
| Fit score | `matches` | `ats_screenings` score/verdict |
| Test | adaptive banks | `assessments*` |
| Order | `orders` | `payment_intents`, `service_orders`, `fast_track_orders` |
| Message | `messages` | `candidate_messages`, `company_notices`, `outbound_messages` |
| Audit | `audit_events` (+ actor kind) | `access_log`, per-feature event tables |
| Staff identity | `platform_users` | owner-header identity |

## 4. Tests that should exist before restructuring

1. **Tenant isolation matrix:** two companies, two teams, two candidates; every company/staff/candidate route called with the wrong identity must return 401/403/404 and no foreign data.
2. **Suspension:** suspended company gets 403 on every company route (fails today — S1).
3. **Erasure completeness:** after `deleteCandidateData`, no table holds that `candidate_id` or the person's email/phone/name outside the consent ledger (fails today — S2, S3).
4. **Migration check:** apply all migrations to SQLite; compare to the schema module.
5. **Cross-store consistency:** one email → one `candidates` row (fails today — D1).

## 5. Suggested order of work

1. **Now (small, high value):** S1 company-status check, S2 erasure list, S6 fail-closed dev auth, S7 key split, S8 headers, R4 cleanup, tests 1–3.
2. **Next:** S3/S4 identity resolution plus linked privacy requests, D10 pick Drizzle or raw SQL, R2 `lib/core` consolidation, R3 CI.
3. **Then (migration-heavy):** D1 + D2 + D3 (person, job and pipeline unification), D8 audit, D4/D5 engine consolidation.
4. **Last:** D6/D7/D9 consolidation, R1 route regrouping, R7 remove dead mode.

Run D1–D3 first as a data migration with a dry run; they change the most tables, and R1 and R2 are mechanical moves that are safest after tests exist.
