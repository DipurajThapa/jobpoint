# Job portal (Phase 1): how it works, how to run it, what is still open

Built 9 November 2026 on branch `claude/relaxed-planck-7ozou6`. The original proposal is [PORTAL_PHASE1_PLAN.md](PORTAL_PHASE1_PLAN.md). The research behind the decisions is in [research/portal-india-hr-legal-2026-11-09.md](research/portal-india-hr-legal-2026-11-09.md) (Indian portals, HR conventions, DPDP, email/SMS, assessments, anti-bypass) and [research/portal-matching-design-2026-11-09.md](research/portal-matching-design-2026-11-09.md) (matching, score fusion, psychometrics, anti-gaming, with sources).

**Registration is closed in production** until the owner sets `PORTAL_OPEN=true`, which should happen only after legal sign-off (see [Before going live](#before-going-live)).

---

## 1. What it does

| Who | Can | Cannot |
|---|---|---|
| **Candidate** (free) | One page, "My CV and privacy": sign up, upload a CV (PDF/DOCX), correct the parsed profile, give or withdraw each consent separately, hide their profile from named companies, export their data, delete their account. Job browsing, applying and skill tests are hidden in the interface (owner decision, 9 Nov 2026); their API endpoints remain. | See their exact score or other candidates. |
| **Company user** (invited by Jobboard300, or by their company owner) | Overview dashboard, hiring pipeline with interviews, offers, joining and placements, team. Post JDs (go live only after admin approval), see anonymised previews of CVs the system released to them, unlock a CV (uses one unit of quota), download a watermarked PDF of an unlocked CV, move applicants through stages, request parameter changes, propose a company assessment. | See any CV, contact or file outside its approved parameters and unlocked set; set its own parameters; see a CV file before unlock; see the original DOCX. |
| **Admin** (site owner only, existing sign-in) | Approve companies, set each company's matching parameters, approve JDs and parameter change requests, assign plans and adjust quota, approve company assessments, resolve parse reviews and duplicates, merge candidates, resolve abuse flags, run the queue. | — |

Working Platform staff have no access to the portal admin.

### Client workspace (added 9 November 2026)

- **Sign-in by invitation.** The admin console's **Invite a client** creates an active client, with its matching rules, plan, replacement-guarantee days, non-solicitation months and fee terms. It produces a one-time link (`/portal/accept`, valid 7 days) for the owner to set a password. This works while public registration is closed.
- **Team.** The owner adds colleagues (one-time links) and removes them.
- **Overview, pipeline, interviews, offers and joining, and hires.** The pipeline stages are Submitted by Jobboard300 → Shortlisted → Interviewing → Offer made → Offer accepted → Joined. Closed outcomes need a reason code. Joining creates a placement carrying the end of the replacement guarantee and the date until which Jobboard300 will not approach the person about other jobs.
- **Managed searches.** The client asks Jobboard300 to recruit. The admin submits matching candidates with a note. This needs the candidate's consent to share, uses no unlock quota, and the fee is on placement.
- Code: `lib/portal/client.ts`; migration `drizzle/0006_client_workspace.sql`.
- Review and roadmap: [REVIEW_AND_ROADMAP_2026-11.md](REVIEW_AND_ROADMAP_2026-11.md).

### One candidate list (added 9 November 2026)

Every application made on the public website joins the same candidate records as portal sign-ups, with its CV read the same way (`lib/portal/website.ts`, migration `0007_one_candidate_list.sql`). What Jobboard300 may do follows exactly what the person ticked on the website form. The ticks are recorded in the consent ledger against the website form's wording, with channel `website`.

| Website tick | Ledger entry | Effect |
|---|---|---|
| "Contact me about other suitable roles later" | `profile_processing` granted | Matched to clients' jobs (visible to Jobboard300 only) |
| "You may share my CV with an employer for a suitable role after reviewing the fit" (general registration) | `recruiter_sharing` granted | A recruiter may submit them to a client's managed search |
| The same tick on a role-specific application | nothing | Covers that one role only, so it is not general sharing |

- Automatic anonymous release to companies still needs the portal's own `share_with_companies` consent, so website-only candidates are never released automatically.
- A website applicant is never attached to a portal account by email alone, because the website does not verify email. A separate record is created and flagged as a possible duplicate for the admin to merge.
- The same person applying again on the website joins their existing website record.
- If the admin withdraws a website applicant's optional consents in the console, matching and sharing stop in the candidate list as well.
- If the admin deletes the person's last website application, and they have no portal account, their candidate record is erased.
- Applications made before this change can be added from the admin's **Job portal** tab, 25 at a time.

### Staff roles and the Recruiting tool (added 10 November 2026)

Jobboard300 staff work in the Working Platform's **Recruiting** tool (`/platform/recruiting`), not the owner console (`lib/portal/staff.ts`, migration `0008_staff_assignment.sql`).

| Role | How it is set | Sees | Can assign |
|---|---|---|---|
| Admin | Working Platform administrator | Every client and job | Clients to teams, jobs to recruiters, team managers |
| Team manager | Flag on a team member, set by an admin. A franchise is a team with its own manager. | The team's clients and all their jobs | Jobs to members of their own team |
| Recruiter | Team member with the Recruiting tool | The team's clients; jobs unassigned or assigned to them | Nothing |

- A client belongs to at most one team, so nobody outside it can read or fulfil its jobs. Out-of-scope records are reported as "not found".
- Staff with Edit access can submit candidates to managed searches, update pipeline stages with a note, and schedule interviews (phone, video link, in person). History records which staff member acted.
- New tools default to "no access" on invitations. Admins add people to teams under Operations.
- Not built yet: a team manager inviting their own staff (an admin does it), and AI interviews.

## 2. Architecture

- Same app and Worker as the consultancy site. New areas: `/candidate`, `/company`, `/portal/*` (sign-in, register, verify, forgot, reset) and the **Job portal** tab in `/admin`.
- Domain logic: `lib/portal/*.ts`. These modules take a small `Db` interface (D1-compatible), so the same code runs in the Worker and in Node tests (`scripts/lib/d1-sqlite.mjs` applies the real migrations to an in-memory SQLite).
- API routes:
  - `app/api/portal/auth/[action]` — register, verify, sign-in, sign-out, reset-request, reset.
  - `app/api/portal/candidate/[action]` — jobs, applications, profile, export, consent, block, apply, delete, assessments, upload.
  - `app/api/portal/company/[action]` — dashboard, matches, candidate, download, JD lifecycle, params-request, unlock, application-status, assessment-create.
  - `app/api/admin/portal/[action]` — owner only.
- Data: migration `drizzle/0005_portal.sql`. CV files live in R2 under private keys; D1 holds metadata, parsed profiles, matches and ledgers.
- Sessions: separate `portal_accounts`/`portal_sessions` with a `__Host-` cookie, not the Working Platform's. Every mutation checks same-origin.
- No cron is available on this hosting. The score queue drains after each write (CV upload, JD approval, parameter decision) and from the admin **Run queue** button, which also purges expired deletion stubs. Each run handles at most 400 CV–JD pairs.

## 3. Matching

Engine version `portal-match-2026.11.1` (`lib/portal/match.ts`). It is deterministic and explainable: the same CV and JD always give the same score and the same reasons. It reuses the CV and JD parsers of the owner-only screening tool ([ATS_SCREENING.md](ATS_SCREENING.md)) and adds Indian fields (`lib/portal/india.ts`).

### 3.1 Hard filters (two-sided)

A candidate is considered for a JD only if all of these pass. Each failure is recorded with its reason.

| Filter | Rule |
|---|---|
| Location | Same labour market as the job (metro mapping, e.g. Howrah = Kolkata), a remote job, or the candidate states they will relocate. |
| Experience | At least the JD minimum, with a 0.25-year tolerance. |
| Seniority | Within the company's approved bands (fresher <1, junior 1–3, mid 3–6, senior 6–10, lead 10+) with ±1 year tolerance, and within ±2 years of the JD's own band. |
| Mandatory skills | Each mandatory any-of group is met. Mandatory comes only from JD lines saying must/mandatory/required/essential, core taxonomy skills only, at most 4. "A or B" lines form one group. |
| Notice | Within the JD/company maximum if the candidate stated it. |
| CTC | Expected CTC ≤ max × 1.1 if stated. |
| Stated CTC/notice | Required only if the admin turned that on for the company. |
| Candidate side | Consent to share is active; the company is not on the candidate's hidden list; the CV is not an unresolved duplicate whose twin is already eligible. |

### 3.2 Score

Weights are worked out per JD, so the same candidate ranks differently for different JDs:

- must-have = 25 + 2.5·min(m, 8), where m is the number of must-have items;
- nice-to-have = min(15, 3n);
- experience, title/role and education defaults shift with seniority (entry 5/15/5, senior 20/5/15, otherwise mid);
- location 5 (0 for remote);
- company assessment, when attached, = clamp(15 + 25·coverage·relevance, 15, 40);
- every weight has bounds, and the set is projected to sum to 100 (largest-remainder rounding).

Each requirement's evidence becomes a mean and a variance:

- evidence means: shown in work history 1.0, summary 0.8, skills list only 0.6·min(1, 25/number of listed skills). The last term stops keyword stuffing from paying.
- a skill test result is an observation with known error. It is combined with the CV prior by normal–normal shrinkage, Z = τ²/(τ² + e²), with τ = .2 (work), .25 (summary), .3 (list). A requirement with a good test result therefore moves towards the test, and a bad test overrides an inflated CV claim.
- CV-only requirements are treated as correlated (ρ = 0.3), so a CV cannot narrow its own uncertainty by listing more of the same.

S = 100·Σwm/Σw, SD = 100·√(Σw²v)/Σw, and the **lower bound L = S − 1·SD**. Ranking and release both use L. A candidate who skips the tests keeps a valid CV-based score with a wider range; a candidate with the same mean and a confirmed test ranks above them. This is the "pessimistic ranking" approach (Evan Miller; Bühlmann credibility; Wainer). Sources are in the matching research note.

Candidates see bands only. When they are near a release threshold the app suggests a relevant skill test.

### 3.3 Release and unlock

- `runReleases` releases a candidate to the company when L ≥ the company's approved minimum and every gate above passes. The admin sets a cap per JD (minimum 5). A better candidate displaces the lowest released-but-not-unlocked one.
- No padding: if nobody qualifies, the company sees "No strong matches yet".
- Previews are built from an allow-list (title, role family, seniority, years, up to 8 key skills, city, relocation, education level, notice band, CTC band, score and reasons). Then `redactLeaks` replaces the candidate's name, email, phone, links, employers and institutions anywhere they slip through.
- Each company sees a different opaque reference per candidate (`c_` + HMAC), so references cannot be compared across companies.
- **Unlock** is atomic in one D1 batch. The insert happens only if no unlock exists and quota > 0, and the ledger row is written only if the unlock row was. It is unique per company and candidate: unlocking the same person again, for any JD, costs nothing.
- Quota is per **company account**, shared by all its users and JDs. Unused units expire with the plan. Unlocked CVs stay visible after a downgrade or expiry.
- Downloads are a PDF: the original PDF, or a clean rendering of a DOCX. Every page carries the company name and a unique trace ID, which is logged.

### 3.4 Measured on the seed set

36 fictional CVs (real PDF/DOCX files through the real parser) × 5 JDs, each CV graded 0–3 per JD by hand. The full report is [verification/portal-ranking-2026-11-09.md](verification/portal-ranking-2026-11-09.md).

| JD | P@5 | nDCG@10 | Release precision |
|---|---|---|---|
| Accounts Executive (Durgapur) | 1.00 | 0.88 | 1.00 |
| Inside Sales (Kolkata) | 0.80 | 0.98 | 1.00 |
| Customer Support – Voice (Kolkata) | 0.75 | 0.85 | 1.00 |
| Warehouse (Durgapur) | 1.00 | 0.88 | 1.00 |
| Full-stack developer | 0.80 | 0.94 | 1.00 |

This is a small hand-made set. It shows the engine behaves sensibly, not that it is calibrated. Calibrate on real outcomes (shortlists, interviews) once they exist.

## 4. Assessments

`lib/portal/assessment.ts`. Classical test theory, Phase 1:

- Randomised forms drawn per blueprint section. The deadline is server-side (30 s grace). Answers under 2.5 s count as wrong (rapid guessing).
- **Integrity hold** (not a penalty): more than 3 tab switches, any paste, or rapid answers on more than a third of items. Held attempts do not count until the admin clears them.
- Retakes: 30-day cooldown, at most 3 attempts in 12 months. The **score of record** is a precision- and recency-weighted pooled mean (half-life 180 days), not the best attempt, so retaking until lucky does not pay.
- Item statistics: KR-20 reliability and point-biserial per item. Items with r_pb < .2 after 100 responses are retired.
- **Company tests** need admin approval. Items are screened for questions about protected traits (religion, caste, marital status, age, pregnancy and similar) and rejected if found.
- Skill tests feed the matching requirements they cover. A company test feeds that company's JDs only.

## 5. Anti-bypass and abuse controls

- No CV file or contact before unlock. Watermark and trace ID on every download.
- Rate limits (`rate_limits` table), per account and per IP hash:

  | Action | Limit |
  |---|---|
  | List | 120/hour, 600/day |
  | View full | 60/hour |
  | Download | 60/hour |
  | Unlock | 30/hour |
  | Sign-in | 20 per 15 minutes |
  | Register | 10/hour |
  | CV upload | 3 per 30 days |

- `audit_events` (rows of kind `access`; formerly `access_log`) records every list, view, unlock and download. A high browse count with few unlocks raises an `abuse_flags` row for the admin.
- Every company query is scoped to its approved, released or unlocked set. The end-to-end check probes for leaks (section 8).
- Contract terms are still needed: hiring-only use, no resale or scraping, deletion on notice, and a direct-hire clause. The research suggests a 6-month introduction window. Counsel should confirm enforceability under s.27 of the Contract Act.

## 6. Privacy and DPDP

Status from the research (secondary sources, **counsel must confirm**):

- The DPDP Rules 2025 were notified 13 Nov 2025. Consent-manager provisions start about **13 Nov 2026**. Most fiduciary duties (notice, security, breach, retention, rights) start about **13 May 2027**.
- MeitY proposed in January 2026 to shorten the 18 months to 12. As of September 2026 that had not been notified. **Check the e-Gazette this week.**

What the build does:

1. **Itemised, standalone consent** at sign-up (`lib/portal/notice.ts`, version `portal-2026-11-09b`, reworded when the candidate area was reduced to "My CV and privacy"). There are three separate purposes: profile and matching, sharing with companies, and optional service offers. Each grant or withdrawal is a new row in an append-only ledger, with the notice version.
2. **Withdrawal takes effect immediately**:
   - matches are deleted;
   - unreleased and released-not-unlocked previews are revoked;
   - companies that unlocked lose access (they see the withdrawal date);
   - each such company is emailed to delete downloaded copies within 15 days.
   The unlock record and quota unit stay as an audit record.
3. **Account deletion** erases the CV files (R2), profiles, applications, attempts and contact details. A content-free stub (IDs, consent ledger, unlock records) is kept for one year for Rule 8(3) and s.11(1)(b) ("who was my data shared with"), then purged by the queue run.
4. The 3-year inactivity erasure in the Third Schedule **does not apply** (a job portal is not a listed class). The general purpose-based erasure in s.8(7) does.
5. The matcher never uses name, gender, age, religion, caste, marital status or photo. These are removed before scoring, as in the ATS tool.
6. Adults only (18+ declaration). Data export is available to the candidate in one click.

The research treats a company that unlocks a CV as most likely a **separate data fiduciary**. No source obliges the portal to pass on a withdrawal to independent fiduciaries; the 15-day deletion request is a contractual measure. Ask counsel to confirm this, and Rule 8(3) retention.

## 7. Operations

| Setting | Required | Purpose |
|---|---|---|
| `PORTAL_SECRET` | Yes in production (falls back to `PLATFORM_SECRET_KEY`) | Signs candidate references and tokens. Never change it after launch: references would change. |
| `MAIL_API_KEY`, `MAIL_FROM` | Yes for self-registration | Transactional email via Zoho ZeptoMail (verification, reset, withdrawal notices). Without it, development returns the link on screen; production cannot verify sign-ups. |
| `MAIL_API_URL` | No | Override the ZeptoMail endpoint (default `https://api.zeptomail.com/v1.1/email`). **The request body shape is unverified**; send one test email before launch. |
| `PORTAL_OPEN` | Set to `true` only after legal sign-off | Opens registration in production. |
| `ANTHROPIC_API_KEY` | No | Optional AI-assisted CV extraction, shared with the ATS tool. |

- **Plans** (seeded on first visit to the admin tab, editable; prices exclude GST and are indicative, between Naukri Resdex Lite and Indeed India per-contact pricing):

  | Plan | Unlocks | Validity | Price |
  |---|---|---|---|
  | Free, once per company | 5 | 30 days | — |
  | Starter | 100 | 90 days | ₹7,999 |
  | Growth | 250 | 180 days | ₹17,999 |
  | Pro | 500 | 365 days | ₹29,999 |

  Payment is a stub: assigning a paid plan records a `payment_intents` row with status `stub`.
- **Future services** (CV writing, LinkedIn optimisation, spoken English, Tally and GST training) are seeded inactive. The tables `services`, `service_orders`, `service_enrolments` and `payment_intents` are ready, with no screens.
- SMS OTP is not built. Commercial SMS in India needs TRAI DLT registration first (about two weeks).

## 7a. Notifications, inbox and WhatsApp set-up

Every update writes a message, in `lib/portal/notify.ts` (migration `0009_notifications.sql`).

- **Candidate inbox** (`messages`, candidate inbox, shown on "My CV and privacy"): CV received / incomplete (lists what is missing) / needs review, application received, submitted to a client, profile opened, CV downloaded, each stage change, interview scheduled (India time and link), offer, hire, not selected. Messages state the **outcome only**: never the interviewer's feedback, a rating or a score.
- **Client updates** (`messages`, client inbox, shown on the client dashboard until marked read): new submission, stage changes made by Jobboard300 staff, interviews scheduled.
- **Weekly summary**: the queue run adds one counts-only summary per candidate per 7 days (times seen, opened, downloaded).
- **WhatsApp** is provider-ready but sends nothing yet. Each candidate message also writes a queue row to `messages` (`queued` when a sender number is set up, otherwise `skipped`). To go live, a sender reads the `queued` rows, calls the provider API and marks them sent; nothing else changes.
- **Whose number is used** (`messaging_settings`, `resolveSender`): the client's team number first; the admin's number when the team has none; the admin's number for everyone when the admin turns on "override". Team managers set their own team's number in Recruiting → WhatsApp set-up; only the admin sets the main number and the override.
- **Team managers** invite recruiters into their own team (Recruiting tool only, one-time 72-hour link) and remove them. They cannot invite into, or see, another team.
- Deleting a candidate deletes their inbox and queued messages.

## 7b. Placement-fee model and client access (default)

Policy lives in `lib/portal/policy.ts`; migration `0010_placement_model.sql`.

- **Commercials.** No CV quotas are sold. Each client has `fee_percent` (7.5 to 8.33, default 8.33) and a replacement guarantee (default 60 days). On joining, the placement stores the fee percentage and the fee in rupees (annual CTC × percentage).
- **Managed only.** Every job is recruited by Jobboard300. The client API refuses `matches`, `unlock`, `pipeline-add`, `application-status`, `params-request` and switching a job to self-service (`MANAGED_ONLY`).
- **Temporary access.** `unlockedCandidate(..., temporary)` requires an open pipeline entry on a job that is not closed; otherwise `ACCESS_ENDED`. Contact details are blanked, and the download is a re-rendered PDF with contacts removed, until the offer stage.
- **Black box.** The client dashboard carries no match counts, scores, reasons or matching rules. A live job's requirements can change three times in 30 days (`EDIT_LIMIT`).
- **Client list.** Candidates hide from employers by typed name (`hidden_company_names`); the company list is never returned to candidates.
- **Older self-service mode.** `CLIENT_SELF_SERVICE=true` turns browsing and unlocking back on. Locally: `CLIENT_SELF_SERVICE=true npm run dev`. `check-portal-e2e.mjs` covers that mode and must be run with it on; `check-recruiting-e2e.mjs` covers the default mode and must be run with it off.

- **Three at a time for staff.** Recruiters and team managers see the three best undecided candidates for a job, without scores (`staffCandidates`, migration `0011_shortlist_passes.sql`). Submitting one, or passing with a reason, brings up the next; passes are capped at 15 per job per day. A recruiter can submit only a candidate currently shown. The admin sees the full ranked list, the scores and each pass reason: that record, with pipeline outcomes, is what matching is tuned from.
- **Early exits.** A candidate who left a placement inside the replacement period is marked for staff on every later shortlist (derived from `placements.status`). Clients and candidates do not see the mark.

See `docs/SECURITY.md` for the access table and the breach response plan.

## 7c. Assessments, Fast Track and the offer commitment

Engine in `lib/portal/adaptive.ts`, commitment in `lib/portal/commitment.ts`, migration `0012_assessments_fast_track.sql`.

- **Three kinds of test, one engine.** *Technical*: a Fast Track candidate takes it when they choose. *Aptitude*: Jobboard300's own test, sent to chosen candidates only when the client opted in on that job (`jds.aptitude_test`, set by the admin or team manager). *Client*: the client's questions, sent to chosen candidates for that client's jobs.
- **Adaptive.** 20 questions in 25 minutes, starting at level 5 of 10. Correct raises the level, wrong lowers it (two levels for the first four questions, then one). The result is the level the test settled at: 1 to 4 beginner, 5 to 7 intermediate, 8 to 10 expert. Questions are drawn at random without repeats; options are shuffled per sitting; the answer never leaves the server; the clock is kept by the server.
- **Question banks** (`/platform/assessments`, the Assessments tool). Administrators and invigilators (the tool at Edit) create banks, add questions one at a time or by pasting spreadsheet rows, withdraw questions and set a bank live. Every question is checked: level 1 to 10, three to six distinct options, a marked answer, and no "all of the above" style options (they break under shuffling). Upload answers are a letter or the option's exact text; an ambiguous answer is refused. A bank needs 20 active questions to go live; aim for 10 to 20 per level. "Load sample banks" (admin) adds two working banks with computed answers; sample banks never count towards ranking.
- **Fast Track.** The admin sets the price and payment instructions. A candidate's request creates an order with a reference; they become Fast Track only when the admin confirms the payment was received. There is no payment gateway yet: this is the point to plug one in (`decideFastTrackOrder`).
- **Who sees what.** Candidate: their level; Fast Track candidates also see weak topics. Staff: levels, on the pipeline. Clients: never levels, scores or answers. A verified technical level counts as evidence for that skill in ranking; paying alone changes nothing.
- **Invited tests and the commitment use one-time links** (`/test?token=`, `/commit?token=`), so a candidate needs no account. Tokens are stored hashed.
- **Offer commitment.** Moving a candidate to "offered" creates the commitment and messages the candidate. Staff can reissue the link. Leaving within 60 days is marked for staff and ranks the candidate after everyone else for 12 months. No money is charged.
- **Terms.** `/terms/job-seekers` and `/terms/employers` must be accepted on the website forms; the version accepted is stored with each application and enquiry (`lib/terms.ts`). The client contract template is `docs/legal/RECRUITMENT_SERVICES_AGREEMENT.md` (needs a lawyer's review).

## 8. Checks

```bash
npm run check:portal
```

The unit and integration checks run in Node with no server: 43 checks plus the seed-set ranking. They cover parsing, scoring, hard filters, account-level quota, JD and parameter approval gates, duplicate unlock handling, preview redaction, consent withdrawal, deletion and services, plus the client workspace (invitations, team, pipeline order and reasons, placements, managed submissions, isolation between companies).

```bash
node scripts/local-db.mjs --reset && node scripts/local-db.mjs
```

```bash
npm run check:portal-e2e
```

The end-to-end check needs `npm run dev` running and a reset local database. It has 83 checks in a real browser. They cover onboarding and approvals, CV upload, automatic release, preview, unlock, quota, watermark, withdrawal, and the client workspace (pipeline, interviews, offers, team, managed submissions, invited clients). They also probe that a company cannot reach another company's references, unreleased candidates, contacts, files or JDs.

To write a fresh ranking report:

```bash
node scripts/check-portal-ranking.mjs docs/verification/portal-ranking-YYYY-MM-DD.md
```

## Before going live

Only the owner can do these:

1. **Legal review** of the consent notice, the privacy page, company terms (hiring-only use, deletion on notice, direct-hire clause) and the DPDP points above. Name a grievance officer and the legal entity.
2. **Check the e-Gazette** for the 12-month compression of the DPDP timeline.
3. Set `PORTAL_SECRET`, `MAIL_API_KEY` and `MAIL_FROM`, and send a test email.
4. **Try real CVs.** The seed set is fictional; parse quality on real Indian CVs (scanned PDFs, Hindi/Bengali mixed text, unusual layouts) is unmeasured. Scanned PDFs without a text layer go to admin review.
5. **Payments.** Choose a gateway (Razorpay or similar) and replace the stub.
6. Processor agreements with hosting and email, with specific security safeguards (Rule 6(1)(f)).
7. Then set `PORTAL_OPEN=true`.
