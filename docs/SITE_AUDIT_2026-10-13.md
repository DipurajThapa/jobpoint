# Job Point Consultancy website audit — 13 October 2026

**Scope:** Sites project `appgprj_6accb67691708191b2f360cde6039913`, GitHub `DipurajThapa/jobpoint`. The deployed public site was version 5 when this review began. This document records source findings and the current change set; a deployment result is needed before any change is called live.

## Decision

The website is a **public, read-only design demo**, not an operating recruitment portal. The candidate, employer and privacy forms deliberately accept no submissions. The database, private CV storage and owner console exist, but the company has not completed the operational and legal launch gates. Indexing is deliberately disabled until the public site has usable contact and intake routes. Search optimization cannot make a `noindex` site rank.

## Comparison with small-business recruitment tools

The comparison uses [Indeed's employer candidate-management guide](https://www.indeed.com/hire/resources/howtohub/how-to-manage-candidates-on-indeed) and [Zoho Recruit's staffing feature list](https://www.zoho.com/recruit/staffing-agency-software/features.html). Their full ATS and marketplace portfolios are benchmarks, not an instruction to copy every feature into a small consultancy website.

| Journey or capability | Job Point source | Finding |
| --- | --- | --- |
| Service, sector and process explanation | Homepage sections, FAQ and legal pages | Present; service copy could be expanded with real proof and specific, approved service boundaries. |
| Published job search and detail | Filterable D1 endpoint, server-rendered first listings, job detail and published-only filter | Present in code; no fabricated jobs. A recruiter must provide genuine vacancies. |
| Candidate registration and role application | Distinct consent choices, structured fields, optional private CV, duplicate guidance | Built but disabled in the public demo. No candidate account, status tracking or self-service CV replacement. |
| Employer hiring request | Role/headcount/detail form and restricted review queue | Built but disabled in the public demo. No self-service employer workspace or booking. |
| Recruiter operations | Role publishing, stages, notes, search, privacy queue and audited CV access | Present for the Site owner; no confirmed company recruiter account or team collaboration. |
| Follow-up and scheduling | Human follow-up is described | No acknowledgement or recruiter notification email, reminders, interview calendar or delivery monitoring. |
| Privacy operations | Consent records and manual access/correction/deletion workflow | Present in source; company identity, contact, processors, retention and security procedures remain unapproved. Public rights form is disabled with other demo intake. |
| Analytics and conversion measurement | No third-party tracker | No funnel, vacancy/application conversion or Search Console data. Do not add tracking before privacy review. |

## Architecture and navigation

- Shared components: header, footer, legal-page layout, icons, demo notice, candidate field set and enquiry dialog. Home sections, job details and privacy request remain page-specific. One public-job query supplies both the first HTML response and search API. FAQ copy and structured data share a single source.
- Six user-facing routes: `/`, `/jobs/[id]`, `/privacy`, `/terms`, `/compliance`, `/admin`; an application route exists for each published job. Invalid or closed job IDs correctly produce a 404. Unknown paths use a branded 404 with links to home and current jobs. A 404 for an invalid URL cannot be eliminated, but no literal internal route or anchor is missing in the source checker.
- The public demo has no submit button on disabled forms. Other calls to action open a preview dialog, navigate to a section or job, retry search, or use the owner sign-in flow. Admin and authentication redirects are expected controls, not broken navigation.
- The source check verifies **literal** internal links and anchors. Dynamic job URLs, actual browser click flows, host redirects and live HTTP response codes need deployed testing.

## SEO, GEO and performance

| Check | State / follow-up |
| --- | --- |
| Titles, descriptions and semantic copy | Present, including Durgapur and India recruitment language; substantiate years and business details before indexing. |
| Canonical URLs | Prepared for homepage, published job pages and legal pages. Invalid jobs have no canonical. |
| Robots and sitemap | Demo HTML has `noindex`; robots allows public pages to be crawled so the noindex tag can be read, while disallowing admin and API. Sitemap is empty during the demo. Live mode lists homepage and published jobs only. |
| Structured data | EmploymentAgency and FAQ mirror on-page facts; JobPosting appears only for published jobs when live mode is enabled and a non-confidential hiring organization is identified. Validate real job listings with Google's Rich Results Test after launch. |
| Discoverable vacancy links | First published jobs and their `<a href>` links render in initial HTML. Search filters update from the same public query. |
| Third-party weight | Four WebP photos total about 380 KiB; Google Fonts remains a dependency because it is in the brand requirement. Unused Tailwind, animation and vendor CSS imports were removed, with font preconnect added. No marketing analytics or ad scripts. |
| Lighthouse/Core Web Vitals | **Not measured.** A 100 score cannot be promised from source review. Run mobile and desktop Lighthouse and field Core Web Vitals after a browser-accessible deployment. Target LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at the 75th percentile. |
| Search indexing | **Intentionally off.** After legal/operator readiness, turn on indexable metadata, a populated sitemap, verify Search Console and inspect submitted URLs. No ranking speed or position is guaranteed. |

Google's references: [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [noindex visibility](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [JobPosting](https://developers.google.com/search/docs/appearance/structured-data/job-posting), [Core Web Vitals](https://web.dev/articles/vitals).

## Verification and open gates

- `node --experimental-vm-modules scripts/check-demo.mjs`: targeted public POST rejection, anonymous admin authorization and crawler checks.
- `node scripts/check-navigation.mjs`: literal internal routes and anchor targets.
- `git diff --check`: whitespace integrity.
- Pending: current Sites remote build and deployed browser/API checks, real job detail and form integration, rich-result validation, accessibility assessment, mobile/desktop Lighthouse and field vitals. A CSS/source review is not a Lighthouse audit.
- Before enabling PII intake: named company recruiter account, legal entity and grievance contact, approved notice and terms, retention schedule, processors and data location, malware handling, incident/log procedure, backup restore test, notification delivery method and a tested end-to-end submission-to-recruiter flow. These are release gates, not implemented claims.
