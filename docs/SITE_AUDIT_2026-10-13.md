# Job Point Consultancy — local source audit, 13 October 2026

**Scope and evidence.** Audited the actual `.sites-checkout` source tree on branch `audit/site-readiness-2026-10-13`, including page components, API routes, D1 schema, R2 access and source checks. This is a local code audit, not an audit of the public demo, its hosting environment or a measured browser session. The author of the local dummy fixture also performed this review; runtime controls need independent verification before live intake.

## Result

Four fictional jobs are available **only when `NODE_ENV=development`**. Titles, descriptions, employer names and cards identify them as Dummy references. They can be searched and opened even if local D1 is unavailable; their detail pages have no application form, `JobPosting` data or indexable metadata. The fixture does not seed D1. The checked-in `DEMO_MODE=true` still disables candidate, employer and privacy submissions in every environment. Production builds exclude the fixture, so the actual published job count still depends on confirmed, published D1 records.

## Local source inventory and benchmark

Indeed's [candidate management guide](https://www.indeed.com/hire/resources/howtohub/how-to-manage-candidates-on-indeed) covers status filtering and team collaboration. Zoho Recruit's [staffing features](https://www.zoho.com/recruit/staffing-agency-software/features.html) include pipeline, client portal, search and reporting. They are comparison points, not all required features for a small consultancy.

| Capability | Actual local source | Assessment |
| --- | --- | --- |
| Homepage and journey | Hero, services, sectors, vacancies, candidates, employers, process, FAQ, contact | Present; orderly and responsive CSS breakpoints. Service claims and 13+ years need company confirmation. |
| Vacancy management | Published-only D1 query, role detail and owner create/status routes; four development-only Dummy references | Functional design in source. Genuine roles must be verified and entered by an authorised recruiter. No duplicate vacancy seed was created. |
| Candidate and employer intake | Separate consent/fields, optional CV, reference responses and owner queue | Implemented code paths but disabled by `DEMO_MODE`. No live end-to-end submission is established. |
| Internal recruitment | Owner pipeline stages, search, notes, employer queue, privacy queue, audit events | Present. Owner email is hard-coded; no confirmed company recruiter delegation, team notes, scheduling or notifications. |
| Candidate self-service | None | Status tracking, account, CV replacement and withdrawal require manual staff action. |
| Employer self-service | None | No client portal or shared shortlist feedback. Appropriate to defer until a real operating need exists. |
| Shared components | `PublicHeader`, `PublicFooter`, `LegalPage`, `Icon`, `CandidateFields`, `PublicEnquiryDialog`; shared `listPublicJobs` and FAQ | Reused across pages. Job detail and legal contents remain page-specific. |
| Data controls | D1 records, private R2 CV, owner check, consent timestamps, rate limiter, file signature/size checks | Present in source. These are mechanisms, not proof of platform identity-header integrity, malware safety or legal compliance. |

## Findings by priority

| Priority | Evidence and consequence | Action / closure evidence |
| --- | --- | --- |
| P0 before live intake | `lib/demo.ts` has `DEMO_MODE=true`; POST routes reject requests before storing data. Legal identity, named grievance contact, retention, hosting/processors, incident process and restore test remain unresolved. | Company owner approves facts and operating process; verify a separate end-to-end live-like candidate, employer and privacy journey before any intake switch. |
| P1 security | `lib/admin.ts` authorises by Sites-injected `oai-authenticated-user-*` headers and one owner email. Source tests only simulate these headers. CV DOCX/PDF checks inspect signatures, but no malware scanner or quarantined review path is wired. | Verify platform strips untrusted identity headers; review admin access with the real company account; decide and test a file scanning/control process. |
| P1 operations | No automatic acknowledgement, reviewer notification or scheduling. D1 stores records but recruiter must visit `/admin` to see them; no monitoring or queue SLA. | Agree who owns the inbox and response times, then test records arriving in Candidate pipeline and Employer enquiries with a real operator. |
| P1 privacy | Privacy and terms pages explicitly remain drafts; manual 12-month review flag is not deletion. File deletion precedes D1 deletion and may need reconciliation after partial failure. | Approve notice, recipient/retention/rights process; test identity verification, removal and recovery on isolated records. |
| P2 SEO | Root metadata/canonical and published-job metadata exist, but `DEMO_MODE` sets `noindex`, public sitemap empty, legal pages `noindex`. Dummy routes additionally `noindex`; no fictitious `JobPosting`. | After real vacancies and launch approval, validate canonical, robots, sitemap, structured data and Search Console. Do not index dummy listings. |
| P2 performance | Four WebP photos total about 376 KiB, preconnected Google Fonts, removed unused vendor CSS; package manifest still carries many starter UI dependencies with no imports in `app`, `components`, `lib`, `db`. | Run a successful build and inspect bundle before removing dependencies/lockfile entries; then measure mobile/desktop Lighthouse and field vitals. No score claimed here. |
| P2 navigation | `scripts/check-navigation.mjs` verifies literal links/anchors; invalid and closed role IDs intentionally 404 through `notFound()`. | Browser crawl all routes and action states, including dynamic links, sign-in and responsive menu; allow intentional 404 and auth redirects. |

Google requires genuine, open opportunities for its job experience: [JobPosting guidance](https://developers.google.com/search/docs/appearance/structured-data/job-posting). Its [noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing) explains why public pages must remain crawlable to read noindex; the source's `robots.txt` disallows `/admin` and `/api/`, not all public pages. A 100 Lighthouse score or rapid ranking cannot be asserted from a source review.

## Verification performed and limits

- `node --experimental-vm-modules scripts/check-local-dummy-jobs.mjs`: four dummy records, location/text filtering, direct ID lookup, fallback when local D1 is unavailable, production exclusion.
- `node scripts/check-navigation.mjs`: 33 literal internal links and anchors resolve across six page routes.
- `node --experimental-vm-modules scripts/check-demo.mjs`: 32 targeted checks for disabled public POSTs, anonymous admin denial and crawler directives.
- `git diff --check`: no whitespace errors.
- **Not run:** dependency build, TS typecheck, browser visual/interaction checks, real D1/R2 integration, real Sites identity boundary, HTTP status crawl or Lighthouse. Dependencies and browser preview were unavailable in this local environment. None of the above source checks proves a working deployed portal.

**Release state:** local fixture and code audit only. No production data was inserted, no public deployment changed and no live recruitment intake was enabled.
