# Job Point Consultancy

Full-stack recruitment website for Job Point Consultancy, based in Durgapur, West Bengal. The public interface follows the Talentraa recruitment-template flow, adapted to Job Point's logo colors and selected typefaces.

Brand tokens: primary `#1D4ED8`, secondary `#0A1F5C`, light accent `#93C5FD`; body typeface `Geist`, display typeface `Plus Jakarta Sans`.

## Product features

- Responsive employer and candidate journeys, animated with reduced-motion support.
- Live role search backed by D1. Only published roles appear publicly; no fabricated vacancy records are seeded.
- Public candidate application and employer enquiry forms with validation, explicit consent, honeypot and IP-hash rate limits.
- Optional PDF/DOCX resume upload (5 MB maximum), stored in private R2 and delivered only through an owner-protected admin endpoint.
- Owner-only administration using Sites sign-in: create and publish roles, review applications and hiring enquiries, update statuses, and delete records.
- Job detail pages with `JobPosting` structured data, plus company and FAQ schema on the homepage.
- Original generated recruitment imagery in `public/images`; not third-party stock photos.

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
| `GET /api/admin/jobs` | Site owner | List all role records |
| `POST /api/admin/jobs` | Site owner | Create a draft or published role |
| `PATCH /api/admin/jobs/{id}` | Site owner | Change a role to draft, published, or closed |
| `DELETE /api/admin/jobs/{id}` | Site owner | Close a role without deleting its history |
| `GET /api/admin/records` | Site owner | List candidate applications and employer enquiries |
| `PATCH /api/admin/records/{applications\|enquiries}/{id}` | Site owner | Update the record status |
| `DELETE /api/admin/records/{applications\|enquiries}/{id}` | Site owner | Delete a record and its private CV object, when present |
| `GET /api/admin/resumes/{applicationId}` | Site owner | Download a stored resume |

Candidate multipart fields: `fullName`, `email`, `phone`, `location`, `experience`, `consent=yes`; optional `jobId`, `message`, and `resume`. Employer JSON fields: `contactName`, `company`, `email`, `phone`, `roleTitle`, `location`, `headcount`, `details`, `consent:"yes"`. Both forms include an anti-spam `website` honeypot.

## Data model

The immutable initial migration is `drizzle/0000_job_point_recruitment.sql`. D1 tables: `jobs`, `applications`, `employer_enquiries`, and `rate_limits`. Resume bytes stay in R2; D1 stores only a private object key and file metadata. The public role API excludes unpublished roles and all candidate/employer personal information.

## Build and preview

Use the Sites-managed starter workflow. The package lock is unchanged. After installing dependencies, generate or verify migration metadata with `npm run db:generate`, then run the Sites build command. Local D1 preview and hosted D1 are separate databases. Do not expose the admin routes or resume objects publicly.

Before accepting real candidate information, Job Point Consultancy must confirm its privacy notice, retention period, contact details, and operating process for deletion requests. The current notice is clearly labelled as a draft.
