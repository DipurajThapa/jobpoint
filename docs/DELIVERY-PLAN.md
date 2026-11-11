# Jobboard300 delivery plan — 11 November 2026

All work preserves the shared registration dialogs, separate candidate/business dashboards, geography-neutral marketing, location-specific jobs and equal IT/non-IT coverage.

| Workstream | Deliverable | Acceptance |
| --- | --- | --- |
| Registration and meetings | One employer registration with calendar/day/time selection and calendar export | Available slots only; collision protection; requests labelled tentative; Google/Outlook/ICS exports contain no personal details |
| Intake security | Bounded input, contact throttling, validated CVs, review flags | Injection, abuse, malformed files and cross-account access regression tests |
| Public navigation | Remove About/FAQs from headers, add Blog to header/footer, separate actions visually | Shared navigation and mobile layout checked |
| Admin publishing | Draft/save/preview/publish/unpublish; rich text/media, tables/charts; 1920×1080 banner and descriptions | Admin-only mutations, safe rendering, media restrictions, optimistic locking, unpublished content private |
| Discovery | Published blog index/articles, canonical/social metadata, article/breadcrumb schema, sitemap/feed; editorial SEO/AEO/GEO guidance | Server-rendered content, stable URLs, crawl controls, no fabricated rankings or schema claims |
| Quality and release | Fix the reported CI failure and inspect dependencies | Typecheck, lint, tests and production build pass; GitHub CI checked before merge; deploy verified |

## Findings
- Reported GitHub run failed lint: a home-page link and synchronous registration effect. Tests were skipped.
- Production transactional mail is not configured. New accounts stay pending verification; configuring the provider remains an operational dependency.
- Existing call slots are request windows, not a connected staff calendar. Exports must remain tentative until staff confirms. No external calendar write permissions are needed for downloadable events.
- Changes are built and tested together, then released as one coherent version. No live customer records are used as test data.

## Verification checkpoint
- 115 automated tests pass, including registration, tenant isolation, CV intake, CMS lifecycle and meeting/calendar exports.
- TypeScript and ESLint pass; both errors from GitHub run 43022175894 are corrected.
- Browser preview verified updated public navigation/Blog, the employer calendar, available times and selected-time feedback. Anonymous CMS access redirects to staff sign-in. Authenticated CMS browser interaction remains unverified; real handler tests cover its database/access/publishing behaviour.
- Production mail configuration remains outstanding. Calendar exports are tentative reminders; staff confirmation is separate.
- Final performance review: blog/feed/sitemap and admin article lists select summary metadata only. Full draft bodies load individually, avoiding an all-articles memory spike as the CMS grows.
