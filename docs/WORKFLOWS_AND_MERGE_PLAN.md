# Workflows by role, where they duplicate, and the merge plan

Written 10 Nov 2026 from the code on this branch. "Dead" means the server
supports it but no screen uses it.

## Why the duplicates exist

The product was built in eight steps between 13 Oct and 10 Nov 2026, and each
step added its own tables next to the earlier ones instead of extending them:

| Step | What it added | Tables it introduced |
|---|---|---|
| 13 Oct | Public website: roles, application form, enquiry form, owner console | `jobs`, `applications`, `employer_enquiries` |
| 3 Nov | Staff accounts and Email Kit | `platform_*`, `email_kit_*` |
| 9 Nov | CV screening for the owner | `ats_job_profiles`, `ats_screenings` |
| 9 Nov | Job portal (self-service marketplace) | `candidates`, `cvs`, `jds`, `matches`, `releases`, `unlocks`, plans and quota, first test system |
| 10 Nov | Client workspace, placement-fee model | `pipeline`, `interviews`, `placements` |
| 10 Nov | "One candidate list" | `candidate_sources` (a link, not a merge) |
| 10 Nov | Recruiting tool, notifications | `shortlist_passes`, message tables |
| 10 Nov | Adaptive tests, Fast Track | second test system, `fast_track_orders` |

The business model also changed on the way (from clients browsing and unlocking
CVs to Jobboard300 submitting candidates for a placement fee), and the old
model's tables and screens were left in place behind a switch.

## Candidate

| Goal | Paths today | Verdict |
|---|---|---|
| Give Jobboard300 a CV | (a) Website form on a role or general registration → `applications` + a linked `candidates` row. (b) Portal sign-up and upload → a separate `candidates` row. | **Duplicate.** Same person can exist twice. Keep both doors, one record: merge 1. |
| Apply to a job | (a) Website form for a public role (`jobs`). (b) "Apply" to a client job (`jds`) → `portal_applications`. | (b) is **dead**: the candidate screen has no jobs list. Remove or build; merge 2. |
| Take a test | (a) Adaptive tests (in the screen). (b) First test system (`assessments*`). | (b) is **dead** for candidates. Remove: merge 4. |
| Pay for a service | (a) Fast Track order (in the screen). (b) Services catalogue and orders. | (b) is **dead** (no screen, payments are a stub). Remove: merge 5. |
| See or delete my data | (a) Portal: export, consent, delete. (b) Website: privacy request form, done by the owner. | Both needed (website applicants have no login). Now joined: a verified deletion request erases both records. |

## Business owner (client company)

| Goal | Paths today | Verdict |
|---|---|---|
| Become a client | (a) Website enquiry form → `employer_enquiries`. (b) Portal self-registration → `companies` "applied". (c) Owner invites the client → `companies`. | (a) and (c) are the real path, but an enquiry is **not linked** to the client it becomes: merge 6. (b) is closed in production. |
| Post a job | Client workspace → `jds`, approved by Jobboard300. | Single path. |
| Get candidates | (a) Managed: recruiter submits into the pipeline. (b) Self-service: browse anonymised matches, unlock against a quota. | (b) is **switched off** (`CLIENT_SELF_SERVICE`). Decide: remove (merge 3) or keep as a supported mode. |
| Run the hiring process | Pipeline: stages, interviews, offer, joining, exit. | Single path. |

## Jobboard300 (you and your team)

| Goal | Paths today | Verdict |
|---|---|---|
| Publish a vacancy | (a) Owner console "Open roles" → `jobs` (public site). (b) Approve a client's job → `jds`. | **Duplicate, not linked.** A public role and a client job for the same vacancy are two records: merge 2. |
| Work candidates | (a) Owner console "Candidate pipeline": 12 manual stages and notes on `applications`. (b) Recruiting tool and client pipeline: 10 stages on `pipeline`. | **Duplicate workflow.** Merge 1 and 2 make (a) a view of (b). |
| Judge fit | (a) Owner console "CV screening" (`lib/ats/score.ts`). (b) Portal matching (`lib/portal/match.ts`) used by the Recruiting tool. | **Duplicate engines**, different scores for the same person: merge 2. |
| Submit a candidate to a client | (a) Owner console "Job portal" tab. (b) Recruiting tool. | Same function underneath (`submitByRecruiter`). Keep (b); (a) becomes unnecessary once you use one sign-in. |
| Manage staff | (a) `/platform/admin`. (b) `/platform/owner` (first admin and recovery). | (b) is a recovery door only. Fine. |
| Employer outreach | Email Kit, separate from enquiries and clients. | Not linked to `companies`: merge 6. |

## Merge plan

Each merge is one pull request with a migration, a data check before and after,
and tests. They are ordered so each one makes the next smaller.

| # | Merge | What changes | Needs your decision |
|---|---|---|---|
| 1 | **One person record.** `applications` keeps only the application itself (which role, when, the form's free text, consents ticked). Name, email, phone, location, skills, status and notes live on the candidate. | Owner console reads the candidate. No screen changes for candidates. | When a website applicant and a portal account share an email: merge automatically after the portal email is verified? (Recommended: yes.) |
| 2 | **One vacancy record and one pipeline.** A public role becomes a published client job (`jds` with a "show on website" flag). Website applications to it enter the same shortlist and pipeline. The owner console's 12-stage list and CV screening tab are replaced by the Recruiting tool. | `jobs`, `ats_job_profiles`, `ats_screenings`, `applications.status` retired. | Do you still need public roles that belong to no client? (Recommended: yes, under a house "Jobboard300" client.) |
| 3 | **Remove self-service mode**: browse, unlock, quota, plans, parameter requests. | `releases`, `plans`, `company_subscriptions`, `quota_ledger`, parts of `unlocks` and `company_parameters` retired. | Is the placement-fee model final? (If you may sell CV access later, keep it.) |
| 4 | **One test system**: keep adaptive tests, remove the first one. | `assessments`, `assessment_items`, `assessment_attempts`, `assessment_responses` retired; matching uses adaptive results only. | None, unless you have real results in the old tables. |
| 5 | **One orders table** for Fast Track and any later paid service. | `services`, `service_orders`, `service_enrolments`, `payment_intents` folded into one. | Which paid services are planned for the first year? |
| 6 | **Link employers**: an enquiry records the client it became; Email Kit contacts carry the client id. | Two new columns; no data removed. | None. |
| 7 | **One message table and one audit table.** | Internal only. | None. |

## Progress

| # | Status |
|---|---|
| Data inventory | **Done.** Working Platform → Admin → Operations → Data inventory → "Count now", then "Copy as text". Numbers only. |
| 6 | **Done** (migration `0015`). Owner console → Employer enquiries: pick the client an enquiry became. Owner console → Job portal → Companies: pick the client's Email Kit organisation. |
| 7 | **Done** (migration `0016`). `candidate_messages`, `company_notices` and `outbound_messages` are now `messages`; `access_log` is now part of `audit_events` (`kind = 'access'`). Existing rows are copied across by the migration. No screen changes. |
| 4 | **Done** (migration `0017`). The first test system is removed from every screen and from matching, which now reads adaptive test results only. Its four tables are renamed `retired_…`, not dropped. |
| 5 | **Done** (migration `0018`). `fast_track_orders` is now `orders` with a `kind`; a later paid service is a new kind. The unused services catalogue and payment stub are renamed `retired_…`, not dropped. |
| 1 | **Done** (no migration). A website-only record is merged into a portal account's record once the portal has verified the same email: at verification, and at each sign-in for records made earlier. A website form sent later with a verified account's email joins that record as an application only; its ticks and CV are not applied to the account, and the person is told in their inbox. The application row keeps the details typed into the form, as the record of what was submitted: the candidate table stores no email or phone by design, only a one-way match code. |
| 2 | **Done** (migration `0019`). Every website role is one vacancy: a client job (`jds`) with the same id, under the client chosen when posting or the house client "Jobboard300". `jobs` is now only that vacancy's website listing. Publishing, unpublishing or closing a role moves the same vacancy. Roles posted earlier get their vacancy record when the owner opens "Open roles". A website application to a role enters that job's shortlist in the Recruiting tool, is scored for that role only unless the person ticked the general matching box, and can be submitted to that role's client only if they ticked the sharing box for it. The owner console's 12-stage list is read-only (it shows the Recruiting tool's stage), and the CV screening tab is removed; its tables are renamed `retired_…`. |
| 3 | **Not started: needs a yes or no.** The plan has no recommendation here. Remove self-service mode only if the placement-fee model is final; keep it (switched off, as now) if CV access might be sold later. |

The `retired_…` tables hold whatever the old tables held. They are dropped in a
later migration once the data inventory shows nothing in them is needed.

Before merges 1 to 5 I need one fact from the live database: the row counts of
the tables being retired. Run the data inventory once this is live and
paste me the text.
