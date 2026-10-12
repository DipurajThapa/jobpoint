# Job Point Consultancy

Full-stack recruitment website for Job Point Consultancy, based in Durgapur, West Bengal. The public interface follows the Talentraa recruitment-template flow, adapted to Job Point's logo colors and selected typefaces.

Brand tokens: primary `#1D4ED8`, secondary `#0A1F5C`, light accent `#93C5FD`; Google typeface `Plus Jakarta Sans` throughout (body 400–500; headings 700–800), with Google Material Symbols Rounded icons.

## Product features

- Responsive employer and candidate journeys, animated with reduced-motion support.
- Live role search backed by D1. Only published roles appear publicly; no fabricated vacancy records are seeded.
- Public candidate application and employer enquiry forms with validation, explicit consent, honeypot and IP-hash rate limits.
- Structured candidate fields, recruiter search, possible-duplicate flags and human-controlled application stages.
- Optional PDF/DOCX resume upload (5 MB maximum), stored in private R2 and delivered only through an owner-protected admin endpoint.
- Owner-only administration using Sites sign-in: create and publish roles, review applications and hiring enquiries, update statuses and notes, and delete records.
- Privacy request queue for access/correction/deletion/withdrawal/grievance, identity verification step, consent/version records, retention review indicators and audit events for sensitive admin actions.
- Job detail pages with `JobPosting` structured data, plus company and FAQ schema on the homepage.
- Original generated recruitment imagery in `public/images`; not third-party stock photos.
- Shared public navigation follows About → Services → Jobs → Candidates → Employers → FAQs. White and neutral surfaces balance blue action accents.
- Privacy, terms and safeguards pages describe actual behavior and unresolved legal facts; policy drafts are excluded from indexing and the sitemap.

## Runtime architecture

- Next-compatible React app compiled through Vinext to a Cloudflare Worker.
- Cloudflare D1 binding `DB` stores jobs, applications, employer enquiries, and rate-limit counters.
- Cloudflare R2 binding `BUCKET` stores private resume objects.
- No third-party database, mail provider, payment processor, or tracking script is configured.

## API surface

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/jobs?q=&location=` | Public | Search published roles |
| `POST /api/applications` | Public | Submit candidate details and an optional PDF/DOCX resume as multipart form data |
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

Candidate multipart fields: `fullName`, `email`, `phone`, `location`, `experience`, `consent=yes`, `adult=yes`; optional `jobId`, `message`, `resume`, `desiredRole`, `skills`, `education`, `availability`, `shareConsent=yes` and `futureConsent=yes`. General registration requires `futureConsent=yes`. Employer JSON fields: `contactName`, `company`, `email`, `phone`, `roleTitle`, `location`, `headcount`, `details`, `consent:"yes"`. Both forms include an anti-spam `website` honeypot.

## Submission and access behavior

A successful candidate submission creates an application record; its optional CV is private in R2. A successful employer submission creates an employer enquiry. Both confirmations show a reference derived from the saved record ID, also shown in the admin console. Recent duplicate candidate submissions return an explicit 409 response and do not overwrite an existing CV. Verified profile correction/withdrawal/deletion is handled through the existing privacy request and admin workflow; candidate self-service CV replacement is not implemented. No acknowledgement email, recruiter email notification or messaging integration is configured.

The owner signs in at `/admin` using the owning ChatGPT account. Candidate records are under **Candidate pipeline**; employer forms are under **Employer enquiries**; privacy requests are under **Privacy requests**. CV downloads are owner-authorised and audited. The owner account is currently `dipuraj.thapa@gmail.com`. A confirmed Job Point recruiter account and access policy must be configured before the company handover. The current site is owner-private, so outside candidates and employers cannot use it until public release is authorised and ready.

## Data model

The immutable migrations are `drizzle/0000_job_point_recruitment.sql` and `drizzle/0001_recruitment_operations.sql`. D1 tables: `jobs`, `applications`, `employer_enquiries`, `privacy_requests`, `audit_events`, and `rate_limits`. Resume bytes stay in R2; D1 stores only a private object key and file metadata. The public role API excludes unpublished roles and all candidate/employer personal information.

## Build and preview

Use the Sites-managed starter workflow. The package lock is unchanged. After installing dependencies, generate or verify migration metadata with `npm run db:generate`, then run the Sites build command. Local D1 preview and hosted D1 are separate databases. Do not expose the admin routes or resume objects publicly.

The operating recommendation and decisions are in [docs/DIGITAL_RECRUITMENT_BLUEPRINT.md](docs/DIGITAL_RECRUITMENT_BLUEPRINT.md). Before public intake, Job Point Consultancy must confirm its legal identity and privacy contact, processor and storage arrangements, retention and deletion policy, backup restore process, CV malware-scanning approach, breach response, and any domestic/overseas recruiting obligations. The public privacy notice names these release dependencies. Sites completed the remote build and private deployment on 13 October 2026. Browser/API/security verification remains incomplete; do not accept live PII until these gates are verified.
