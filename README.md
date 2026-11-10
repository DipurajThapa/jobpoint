# Jobboard300

Full-stack recruitment website for Jobboard300, based in Kolkata, West Bengal. The public interface follows the Talentraa recruitment-template flow, adapted to Jobboard300's logo colors and selected typefaces.

Brand tokens: primary `#1D4ED8`, secondary `#0A1F5C`, light accent `#93C5FD`; Google typeface `Plus Jakarta Sans` throughout (body 400–500; headings 700–800), with Google Material Symbols Rounded icons.

## Product features

- Responsive employer and candidate journeys, animated with reduced-motion support.
- Live role search backed by D1. Only published D1 roles appear in production. Four clearly marked Dummy references appear only in local development; none are seeded into D1 or accepts applications.
- Public candidate application and employer enquiry forms with validation, explicit consent, honeypot and IP-hash rate limits.
- Structured candidate fields, recruiter search, possible-duplicate flags and human-controlled application stages.
- Mandatory PDF/DOCX CV upload (5 MB maximum), stored in private R2 and delivered only through an owner-protected admin endpoint.
- Owner-only **CV screening (ATS)** in the admin console. It reads each CV into structured JSON, compares it with the client's job description and gives an explainable fit score with evidence. Recruiters make every decision; personal characteristics are removed before screening. See [docs/ATS_SCREENING.md](docs/ATS_SCREENING.md).
- **Job portal (Phase 1)**, closed to registration until legal sign-off. Candidates upload CVs free and manage them on one page, "My CV and privacy"; hiring companies post JDs that go live after admin approval. CVs are released automatically only within each company's admin-set parameters, as anonymised previews. Companies unlock full CVs from a quota plan, with watermarked downloads, rate limits and DPDP-style itemised consent. Optional skill tests feed the score. Clients are invited by Jobboard300 and get the following:
  - an overview dashboard;
  - a hiring pipeline with interviews, offers and joining;
  - placements with replacement-guarantee and non-solicitation dates;
  - team accounts;
  - managed searches, where Jobboard300 submits candidates.

  See [docs/PORTAL.md](docs/PORTAL.md) and the [review and roadmap](docs/REVIEW_AND_ROADMAP_2026-11.md).
- Owner-only administration using Sites sign-in: create and publish roles, review applications and hiring enquiries, update statuses and notes, and delete records.
- Privacy request queue for access/correction/deletion/withdrawal/grievance, identity verification step, consent/version records, retention review indicators and audit events for sensitive admin actions.
- Job detail pages with `JobPosting` structured data, plus company and FAQ schema on the homepage.
- Original generated recruitment imagery in `public/images`; not third-party stock photos.
- Shared public navigation follows About → Services → Jobs → Candidates → Employers → FAQs. White and neutral surfaces balance blue action accents.
- Privacy, terms and safeguards pages describe actual behavior and unresolved legal facts; policy drafts are excluded from indexing and the sitemap.

## Working Platform (internal team area)

`/platform` is the internal, sign-in-only area for Jobboard300 team members. After signing in, people see a dashboard of the tools an administrator has granted them. The first tool is **Email Kit**, the employer-outreach workspace formerly released as Usha. Tools are listed in `lib/platform/tools.ts`, so a future tool is one registry entry plus its route.

- Accounts belong to the platform: email and password, PBKDF2-SHA256 hashing, and hashed session tokens in an HttpOnly cookie. Sessions expire after 12 hours idle or 7 days. Administrators invite people and send password resets as one-time links; no email service is configured. The site owner, verified by Sign in with ChatGPT, creates the first administrator and can recover administrators at `/platform/owner`.
- Every `/platform` page and `/api/platform` endpoint checks the session and the per-tool level (View, Edit or Manage) on the server. Mutations also require a same-origin request. Without access, a page redirects to sign-in or returns 403, and an API returns 401 or 403 with no data.
- Email Kit records, the shared Do not contact list and history are stored in D1. Attachments and daily recovery copies are in private R2. Writes are atomic and checked against the stored revision. The server enforces restriction safeguards: no deletion, narrowing or moving, and lifting requires a reason. It also validates every record with Email Kit's own row checks.
- Guides: [administrator guide](docs/WORKING_PLATFORM_ADMIN_GUIDE.md), [Email Kit and migration from Usha](tools/email-kit/README.md), [design and review](docs/designs/working-platform.md), [test record](docs/verification/working-platform-2026-11-03.md).

## Runtime architecture

- Next-compatible React app compiled through Vinext to a Cloudflare Worker.
- Cloudflare D1 binding `DB` stores jobs, applications, employer enquiries, and rate-limit counters.
- Cloudflare R2 binding `BUCKET` stores private resume objects.
- No third-party database, mail provider, payment processor, or tracking script is configured.

## API surface

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/jobs?q=&location=` | Public | Search published roles |
| `POST /api/applications` | Public | Submit candidate details and a required PDF/DOCX CV as multipart form data |
| `POST /api/employer-enquiries` | Public | Submit a hiring request as JSON |
| `POST /api/privacy-requests` | Public | Submit a privacy request for manual identity verification and review |
| `GET /api/admin/jobs` | Site owner | List all role records |
| `POST /api/admin/jobs` | Site owner | Create a draft or published role |
| `PATCH /api/admin/jobs/{id}` | Site owner | Change a role to draft, published, or closed |
| `DELETE /api/admin/jobs/{id}` | Site owner | Close a role without deleting its history |
| `GET /api/admin/records` | Site owner | List candidate applications and employer enquiries |
| `PATCH /api/admin/records/{applications\|enquiries}/{id}` | Site owner | Update the record status |
| `DELETE /api/admin/records/{applications\|enquiries}/{id}` | Site owner | Delete a record and its private CV object, when present |
| `GET /api/admin/resumes/{applicationId}` | Site owner | Download a stored resume |
| `GET /api/admin/privacy-requests` | Site owner | Review privacy requests and recent sensitive actions |
| `PATCH /api/admin/privacy-requests/{id}` | Site owner | Record a verified request outcome |
| `GET /api/admin/ats`; `GET, PUT /api/admin/ats/jobs/{id}` | Site owner | CV screening: roles, editable requirements, candidates ranked by fit |
| `POST /api/admin/ats/screen`; `GET, PATCH /api/admin/ats/screenings/{id}` | Site owner | Screen a stored CV against a role; read the report; record the recruiter's review |
| `POST /api/admin/ats/analyze` | Site owner | One-off check of a CV against a role or pasted JD (not stored) |
| `/api/portal/auth/{action}`, `/api/portal/candidate/{action}`, `/api/portal/company/{action}` | Portal accounts | Job portal: sign-up and sign-in, candidate CV and consent, company JDs, previews and unlocks (see docs/PORTAL.md) |
| `/api/admin/portal/{action}` | Site owner | Job portal administration: approvals, parameters, plans and quota, reviews, duplicates, abuse flags |
| `POST /api/platform/auth/{sign-in,sign-out,accept,password}` | Public / signed in | Platform sign-in, sign-out, invitation or reset redemption, password change |
| `GET, POST /api/platform/admin/users`; `PATCH, DELETE /api/platform/admin/users/{id}`; `POST …/{id}/link` | Platform administrator | Team list and activity, invite, role/status/tool levels, delete, one-time links |
| `POST /api/platform/owner` | Site owner (SIWC) | First administrator; administrator recovery link |
| `GET /api/platform/email-kit/{state,revision}` | Email Kit View | Shared records and revision |
| `POST /api/platform/email-kit/commit` | Email Kit Edit/Manage by step | Atomic, revision-checked save with restriction guards |
| `GET, POST /api/platform/email-kit/files`; `GET, PUT …/files/{id}` | View / Edit | Attachments (deletes only unused files) |
| `GET, POST /api/platform/email-kit/snapshots`; `GET …/summary` | View/Edit; Manage | Daily recovery copies; record counts |

Candidate multipart fields: `fullName`, `email`, `phone`, `location`, `experience`, `resume` (PDF or DOCX), `consent=yes`, `adult=yes`; optional `jobId`, `message`, `desiredRole`, `skills`, `education`, `availability`, `shareConsent=yes` and `futureConsent=yes`. General registration requires `futureConsent=yes`. Employer JSON fields: `contactName`, `company`, `email`, `phone`, `roleTitle`, `location`, `headcount`, `details`, `consent:"yes"`. Both forms include an anti-spam `website` honeypot.

## Submission and access behavior

A successful candidate submission creates an application record; its CV, which is required, is private in R2. A successful employer submission creates an employer enquiry. Both confirmations show a reference derived from the saved record ID, also shown in the admin console. Recent duplicate candidate submissions return an explicit 409 response and do not overwrite an existing CV. Verified profile correction/withdrawal/deletion is handled through the existing privacy request and admin workflow; candidate self-service CV replacement is not implemented. No acknowledgement email, recruiter email notification or messaging integration is configured.

The owner signs in at `/admin` using the owning ChatGPT account. Candidate records are under **Candidate pipeline**; employer forms are under **Employer enquiries**; privacy requests are under **Privacy requests**. CV downloads are owner-authorised and audited. The owner account is currently `dipuraj.thapa@gmail.com`. A confirmed Jobboard300 recruiter account and access policy must be configured before the company handover. The site is shared publicly as a read-only demo. `lib/demo.ts` sets `DEMO_MODE = true` for both the UI and API. Candidate, employer and privacy request forms are visibly disabled; their POST routes reject every request with HTTP 503 / `DEMO_READ_ONLY` before reading the body, rate limiting, database operations or CV storage. Owner admin access remains authenticated. Demo pages use noindex and an empty sitemap; robots.txt disallows `/admin` and `/api/` while letting crawlers read the public noindex tag. Public demo access does not authorise live recruitment intake. Changing the flag requires a reviewed source deployment after the launch checks below are satisfied.

## Data model

The immutable migrations are `drizzle/0000_job_point_recruitment.sql`, `drizzle/0001_recruitment_operations.sql`, `drizzle/0002_working_platform.sql`, `drizzle/0003_platform_operations.sql`, `drizzle/0004_ats_screening.sql` (CV screening: `ats_job_profiles`, `ats_screenings`) and `drizzle/0005_portal.sql` (job portal: accounts, candidates, consents, CVs, companies, parameters, JDs, matches, releases, unlocks, plans, quota ledger, assessments, future services, access log) and `drizzle/0006_client_workspace.sql` (client terms, managed searches, pipeline, interviews, placements). D1 tables: `jobs`, `applications`, `employer_enquiries`, `privacy_requests`, `audit_events` (now with `detail`), `rate_limits`, plus Working Platform `platform_users`, `platform_tool_access`, `platform_sessions`, `platform_tokens`, and Email Kit `email_kit_records`, `email_kit_state`, `email_kit_files`, `email_kit_snapshots`. Resume bytes stay in R2; D1 stores only a private object key and file metadata. The public role API excludes unpublished roles and all candidate/employer personal information.

## Build and preview

Use the Sites-managed starter workflow. The package lock is unchanged. After installing dependencies, generate or verify migration metadata with `npm run db:generate`, then run the Sites build command. Local D1 preview and hosted D1 are separate databases. Do not expose the admin routes or resume objects publicly.

**Live intake is on** (`DEMO_MODE = false` in `lib/demo.ts` since 9 November 2026): the public application, employer enquiry and privacy request forms accept submissions and the site may be indexed. Set it back to `true` to return to a read-only demo. Portal self-registration is separate and stays closed until `PORTAL_OPEN=true`.

The operating recommendation and decisions are in [docs/DIGITAL_RECRUITMENT_BLUEPRINT.md](docs/DIGITAL_RECRUITMENT_BLUEPRINT.md). Before public intake, Jobboard300 must confirm its legal identity and privacy contact, processor and storage arrangements, retention and deletion policy, backup restore process, CV malware-scanning approach, breach response, and any domestic/overseas recruiting obligations. The public privacy notice names these release dependencies. Sites published version 5 as a public read-only demo on 13 October 2026. Browser/API/security verification remains incomplete; do not accept live PII until these gates are verified.

## Automated tests

See also [workflows and merge plan](docs/WORKFLOWS_AND_MERGE_PLAN.md) and [keys, two-step sign-in and hosting](docs/SECRETS_AND_HOSTING.md).

`npm test` runs the suite in `tests/` (no dev server or network needed). It uses the real migrations in an in-memory SQLite database and calls the real API route handlers. It covers: every route's sign-in guard, company-to-company and candidate-to-candidate isolation, recruiter team scope, suspension, deletion (every column of every table is searched for leftover personal data), sign-up and sign-in privacy, the migrations and typed schema, and the blue (candidate) and green (company) themes. `npm run test:all` adds type-check, lint and the older `check:*` scripts. CI runs the same on every pull request.

Migration `drizzle/0013_audit_fixes.sql` adds `jd_requirement_edits` and the erasure fields on `privacy_requests`. The audit behind these changes is [docs/AUDIT_ARCHITECTURE_DATA_SECURITY_2026-11-10.md](docs/AUDIT_ARCHITECTURE_DATA_SECURITY_2026-11-10.md).

## Demo verification

Working Platform: with `npm run dev` running, `npm run db:local` applies the migrations to the local D1 (`-- --reset` starts empty). Then run `USHA_STANDALONE=/path/to/Usha-3.0.html npm run check:platform`. It is a browser and API test of the whole journey with fictional data, and blocks every external request.

Run `node --experimental-vm-modules scripts/check-demo.mjs` for the intake boundary (read-only in demo mode; cross-site submissions refused when live) and anonymous admin checks. Run `node --experimental-vm-modules scripts/check-local-dummy-jobs.mjs` for local-only sample vacancy behavior. Native Sites remote build validates the complete TSX bundle. Public URL access must be confirmed using Sites access settings; local tests do not prove the platform authentication boundary.

## Website audit

The [13 October local source audit](docs/SITE_AUDIT_2026-10-13.md) records the actual checkout architecture, feature comparison, SEO readiness, dummy fixture and remaining verification/launch gates. Shared candidate fields and the enquiry dialog sit under `components/`; the public job query and FAQ data sit under `lib/`. Run `node scripts/check-navigation.mjs` to verify literal route and anchor targets.
