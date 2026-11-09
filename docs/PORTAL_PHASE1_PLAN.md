# Job portal Phase 1: plan for approval

Status: **built** (9 November 2026). This was the proposal. Where research changed a recommendation (free allowance 5 unlocks for 30 days; plan validity 90/180/365 days; Zoho ZeptoMail; deterministic matching with assessment-aware scoring), the build follows the research. How the portal works now: [PORTAL.md](PORTAL.md).
Date: 9 November 2026. Base: `main` at `202c20e`, plus the CV screening engine in open draft PR #7.

---

## 0. What exists today and what is missing

| Capability | Today | Gap |
|---|---|---|
| Public website, job listings | Yes. The owner posts roles in `/admin`. Public intake is off (`DEMO_MODE = true`). | The listings are the consultancy's own roles. Hiring companies cannot post. |
| Candidate intake | One-off application form with an optional CV (made mandatory in PR #7). No candidate accounts. | Accounts, profiles, corrections, consent centre, job matches, application tracking. |
| CV and JD parsing | PR #7: PDF and DOCX into structured JSON; JD into requirements; personal fields removed. | CTC in INR, notice period in days, seniority, preferred cities, relocation; JD hard filters; corrections by candidates and companies. |
| Matching | PR #7: explainable 0–100 score against one role, run by hand from the admin console. | Every CV against every live JD, hard filters, semantic similarity, automatic release. |
| Company side | None. | Accounts, onboarding, JDs, parameter requests, previews, unlocks, quota, watermark. |
| Admin | Owner-only `/admin` using Sign in with ChatGPT. | Onboarding, parameter and JD approval gates, plans, quota, review queues, logs, scraping alerts. |
| Accounts | Internal team accounts only (Working Platform: PBKDF2 passwords, hashed session tokens). | Separate candidate and company accounts. The same security code can be reused. |
| Email or SMS | **None configured.** | Needed for account verification, password reset and consent receipts (see decision D2). |
| Payments | None. | Phase 1 stub only. The admin assigns plans. |

Conclusion: the portal is mostly new work. It reuses the PR #7 engine, the session security code, D1 and R2, and the owner-only admin gate. PR #7 should be merged first so the portal builds on it.

---

## 1. Decisions I need from you before building

| # | Decision | My recommendation |
|---|---|---|
| D1 | `{{FREE_ALLOWANCE}}`, `{{PLANS}}` and `{{QUOTA_SCOPE}}` were not filled in. | Free allowance of **10 unlocks** once per company. Plans of **100, 250 and 500 unlocks**, each valid for **12 months**. Scope is **per company account**: shared by all its users and JDs, unused unlocks do not roll over, and an unlocked CV stays visible after expiry. INR prices are left blank for you to set. |
| D2 | **Email (and optionally SMS) provider** for verification, password reset and consent receipts. None is configured. | A transactional email provider: Amazon SES (Mumbai region), Resend or Zoho ZeptoMail. Add SMS OTP (for example MSG91) later. Without a provider, candidates cannot self-register safely; only admin-issued one-time links would work, as the Working Platform does today. |
| D3 | **Semantic similarity method.** The current hosting gives only D1 and R2: no vector index and no embedding model. | Phase 1: a skill-relatedness graph plus TF-IDF cosine similarity over normalised skills and titles. It is deterministic, explainable, cheap and runs on Workers. The design allows an embedding provider to be plugged in later (Workers AI if the hosting exposes it, otherwise an external API under a processor agreement). |
| D4 | **Watermarking DOCX.** PDFs can be stamped on every page. DOCX files cannot be stamped reliably. | Companies receive **one watermarked PDF**: the original PDF stamped on every page, or for a DOCX, a clean PDF rendering of the parsed CV plus its text. The original DOCX is never handed out. Each copy carries a visible company stamp and a unique trace ID. |
| D5 | **Same site and brand as Jobboard300?** | Yes: same app and domain, with new `/candidate`, `/company` and `/admin/portal` areas behind a `PORTAL_LIVE` switch. Public intake stays off until legal sign-off. |
| D6 | **Who is "admin"?** | Only you, through the existing owner sign-in. Working Platform staff cannot see the portal admin in Phase 1. |
| D7 | **Release cap per JD.** | The admin sets an optional maximum number of released CVs per JD (default 50, highest scores first). Small numbers are the point. |
| D8 | **Does a company see the candidate's current employer after unlock?** | Yes. The full CV is visible after unlock, never before. |
| D9 | **Unknown CTC or notice period.** | Not a hard fail by default. The JD shows "CTC not stated" and loses a few points. The admin can make "must state CTC and notice" mandatory for a company. |

---

## 2. Data model (Cloudflare D1, new migration `0005_portal`)

Files go to private R2. Every table has `created_at`. Times are ISO 8601 UTC. IDs are random UUIDs.

### Identity and access
- `portal_accounts`: id, kind (`candidate` | `company_user`), email (unique), phone, password_hash, email_verified_at, status (`pending` | `active` | `suspended` | `deleted`), last_sign_in_at
- `portal_sessions`, `portal_tokens` (verify, reset, invite): hashed, the same design as the Working Platform tables

### Candidates
- `candidates`: id, account_id, display_name, current_city, preferred_cities (JSON), willing_to_relocate, open_to_work, status (`active` | `review` | `withdrawn` | `merged` | `deleted`), merged_into, dedupe_key (normalised email and phone hash)
- `candidate_consents`: id, candidate_id, purpose (`profile_processing` | `share_with_companies` | `service_offers`), notice_version, notice_hash, granted_at, withdrawn_at, channel, ip_hash. This is an append-only ledger with one row per grant or withdrawal.
- `cvs`: id, candidate_id, r2_key, file_name, file_type, size, sha256, parse_status (`parsed` | `needs_review` | `failed`), parse_confidence, is_primary, superseded_at
- `cv_profiles`: cv_id, version, data (JSON: the PR #7 profile extended with `seniority`, `ctc_current_inr`, `ctc_expected_inr`, `notice_days`, preferred cities and relocation), source (`parser` | `candidate` | `admin`), corrected_fields (JSON list). The parsed version is kept and corrections create new versions.
- `duplicate_flags`: id, kind (`account` | `cv`), a_id, b_id, signal (`same_file` | `same_email` | `same_phone` | `near_identical_text`), status (`open` | `merged` | `dismissed`), resolved_by

### Companies
- `companies`: id, legal_name, display_name, gstin (optional), website, city, status (`applied` | `active` | `suspended` | `closed`), notes
- `company_users`: id, company_id, account_id, role (`owner` | `recruiter`)
- `company_parameters`: id, company_id, version, params (JSON: min_score, roles[], seniority[], cities[], allow_relocation, ctc_bands[], max_notice_days, mandatory_filters[], max_release_per_jd), status (`requested` | `approved` | `rejected` | `superseded`), requested_by, decided_by, decided_at, decision_note. **Only one approved version is active.** A change request is a new `requested` row and has no effect until it is approved.
- `jds`: id, company_id, title, raw_text, r2_key (optional uploaded file), requirements (JSON: PR #7 requirements plus hard filters such as cities, min_years, mandatory_skills, max_notice_days, ctc_min_inr, ctc_max_inr), corrected_fields, status (`draft` | `pending` | `live` | `paused` | `closed` | `rejected`), params_version (the approved company parameter version it was checked against), decided_by, decided_at, decision_note

### Matching, release, unlock
- `matches`: (jd_id, candidate_id) primary key, cv_id, profile_version, score, hard_pass, failed_filters (JSON), explanation (JSON), engine_version, scored_at
- `releases`: id, jd_id, company_id, candidate_id, score, params_version, released_at, revoked_at, revoke_reason (`consent_withdrawn` | `jd_closed` | `params_changed` | `cv_replaced` | `admin`). Append-only.
- `unlocks`: (company_id, candidate_id) **unique**, first_jd_id, unlocked_by, unlocked_at, subscription_id, trace_id. **Counts once per company, across all its JDs.**
- `applications`: id, candidate_id, jd_id, status (`applied` | `released` | `not_released` | `viewed` | `shortlisted` | `interview` | `offer` | `hired` | `rejected` | `withdrawn`), plus `application_events` for history

### Plans and quota
- `plans`: id, code, name, unlock_quota, validity_days, price_inr (nullable), active
- `company_subscriptions`: id, company_id, plan_id, quota_total, starts_at, ends_at, assigned_by, payment_intent_id (nullable)
- `quota_ledger`: id, company_id, subscription_id, delta (+grant, −1 for an unlock, ± adjustment), reason, unlock_ref. Remaining unlocks = the sum over active subscriptions. An unlock is written atomically with its −1 entry.
- `payment_intents` (**stub**): id, payer_kind (`company` | `candidate`), payer_id, purpose (`plan` | `service_order`), amount_inr, status (`stub`), provider (null), provider_ref (null)

### Future candidate services (data only, no screens or payments in Phase 1)
- `services`: id, code, category (`cv_writing` | `linkedin_optimisation` | `spoken_english` | `technical_training`), name, description, price_inr, delivery_mode (`online` | `offline` | `hybrid`), duration_days, active
- `service_orders`: id, candidate_id, service_id, status (`requested` | `awaiting_payment` | `paid` | `in_progress` | `delivered` | `cancelled` | `refunded`), amount_inr, payment_intent_id
- `service_enrolments`: id, order_id, candidate_id, batch_code, starts_on, ends_on, status, progress (JSON)
- These link to `candidate_consents` purpose `service_offers` (separate and optional; never bundled with job matching).

### Logging
- `access_log`: id, actor_kind, actor_id, company_id, action (`list` | `preview` | `unlock` | `view_full` | `download` | `apply` | …), jd_id, candidate_ref, ip_hash, ua_hash, at
- `release_unlock_log` view over `releases` and `unlocks`: company, JD, candidate, score, timestamp, as you asked
- `abuse_flags`: id, company_id, account_id, rule, window, count, status
- The existing `audit_events` table records admin decisions.

---

## 3. Matching and scoring

### Pipeline
1. **Parse.** CV or JD into structured JSON using the PR #7 engine, extended with:
   - INR CTC normalised to rupees per year ("4.5 LPA", "₹38,000/month", "3,60,000 p.a.", "4 lakhs");
   - notice period in days ("Immediate" = 0, "1 month" = 30, "serving notice till 15 Dec");
   - seniority (`fresher`, `junior`, `mid`, `senior`, `lead/manager`) from titles and years;
   - preferred cities and willingness to relocate.
2. **Candidate review.** The candidate reviews and corrects the parsed fields. JDs are corrected by the company and the admin sees them at approval.
3. **Strip protected inputs.** Name, gender, age or date of birth, religion, caste, marital status and photo are removed before scoring. Images are never read, and the scoring input object has no name field. A test asserts this.
4. **Hard filters.** These are pass or fail and come from both the JD and the company's approved parameters:
   - city: current or preferred city in the JD's cities, or willing to relocate when the JD allows it;
   - minimum experience;
   - mandatory skills: present, with an admin-chosen strictness of "any evidence" or "work evidence";
   - maximum notice days;
   - expected CTC inside the JD band, with ±10% tolerance;
   - permitted roles and seniority from the company's parameters.

   A failure never shows the CV to the company. The candidate can still see why ("needs 3+ years").
5. **Weighted score (0–100)** for CVs that pass the filters:

| Component | Weight | How |
|---|---|---|
| Skill similarity | 40 | Must-have coverage with evidence weighting (work 1.0, summary 0.8, skills list only 0.6). Related skills in the graph earn partial credit. TF-IDF cosine between the CV and JD skill vectors. |
| Experience fit | 20 | Relevant years against the required range. Over the range is flagged, not penalised. |
| Role and title similarity | 15 | Title tokens with synonyms, weighted by recency. |
| Seniority match | 10 | Exact = 1, adjacent = 0.5. |
| Recency | 5 | Relevant work in the last 24 months gets full credit, then tapers. |
| Education and certifications | 10 | Only when the JD asks for them. |

Weights can be changed per engine version. Every match row records `engine_version`.

6. **Explanation for every score.** It is generated only from structured fields, never from free text, so it cannot leak names or contact details:
   - "Meets: Tally (5 yrs, current), GST, 4.5 yrs relevant, Durgapur."
   - "Misses: SAP (nice-to-have)."
   - "Ranks here because must-have coverage is full but the title match is partial."
7. **When scoring runs.** Matches are recomputed when:
   - a CV is uploaded, corrected or replaced;
   - a JD goes live or is changed;
   - parameters are approved.

   Scoring works in bounded batches through a work queue table, drained by requests and an admin "run now" button. If the hosting supports cron, a scheduled drain is added (see risk R3).

### Automatic release
A CV is released to a JD automatically only when **all** of these hold:
- the JD is `live` and its `params_version` equals the company's current approved version;
- the CV passes the hard filters;
- the score is at least the company's `min_score`;
- the candidate has active `share_with_companies` consent;
- the candidate is not withdrawn, merged or under review;
- the JD's release cap is not reached (highest scores first).

The admin never reviews CVs one by one, but nothing outside these rules can reach a company. If nothing qualifies, the company sees **"No strong matches yet"**. The list is never padded.

A candidate's **application** to a JD does not bypass the rules: the CV is released only if it qualifies. Otherwise the application shows "Not matched to this role's requirements".

---

## 4. Roles and permissions

| Action | Candidate | Company user | Admin (you) |
|---|---|---|---|
| Own profile, CVs, corrections, consents | ✔ own | – | view; fix parse; merge duplicates |
| See live JDs and their own matches; apply; track status | ✔ | – | view |
| Create, edit and submit JDs; request parameter changes | – | ✔ own company | approve or reject |
| See released previews (anonymised) for own JDs | – | ✔ | ✔ |
| Unlock (uses quota once per candidate) | – | ✔ owner and recruiter | – |
| See full CV and contacts, download watermarked PDF | – | ✔ unlocked only | ✔ |
| Search the candidate database | – | **never** | ✔ |
| Onboard companies, set parameters, approve JDs, assign plans, adjust quota | – | – | ✔ |
| Logs, abuse flags, review queues | – | own usage summary | ✔ |

Each route checks authorisation on the server, using the session's account plus the company or candidate it owns. Changes also require a same-origin request. IDs are never trusted from the client without an ownership check.

---

## 5. Anti-bypass measures

1. **No database search for companies.** Their only route to a candidate is `/company/jds/:id/matches`, which returns released rows for their own live JD.
2. **Per-company pseudonymous IDs.** A preview uses `HMAC(company_id, candidate_id)`, so IDs cannot be correlated across companies or enumerated.
3. **Redacted previews** are built from an allow-list, never by stripping a full CV:
   - generalised title, years, seniority, key skills (top 8), city, education level, notice band, CTC band, score and explanation;
   - no name, contact details, employers, institutions, links, dates or free text.

   A test asserts the preview JSON contains none of the CV's contact strings, employer or institution names, or URLs.
4. **No file before unlock.** The CV file route requires an `unlocks` row for (company, candidate) and active consent.
5. **Watermark.** The PDF carries "Unlocked by ‹Company› · ‹date› · Trace ‹id›" on every page, plus metadata. Each download is logged, and the trace ID identifies who leaked a copy.
6. **Rate limits and scraping detection** (per user and per company):
   - previews: 120 per hour, 600 per day;
   - unlocks: 30 per hour;
   - downloads: 60 per hour.

   Exceeding a limit returns 429 and raises an `abuse_flags` entry for you. Patterns such as many previews with no unlocks, or night-time bursts, are also flagged. You can suspend an account from the flag.
7. **Every list, preview, unlock, view and download is logged** in `access_log`. Releases and unlocks are also kept in their own tables.
8. **Contact leak checks on companies.** Company JD text and messages are checked for patterns that would take candidates off the platform. There is no company-to-candidate messaging in Phase 1.
9. **Contracts.** The company terms forbid off-platform solicitation and require deletion on request. This is enforceable only by contract, so legal must draft it.

---

## 6. DPDP Act 2023 and DPDP Rules 2025: verified status and design impact

Current status, from multiple secondary sources. I have not read the Gazette text (G.S.R. 846(E)) myself; **legal must confirm it**:
- The Rules were notified on **13–14 November 2025**. Board provisions apply immediately.
- **Consent manager** provisions (Rule 4) apply from about **13 November 2026**, which is this week.
- **Most data fiduciary duties apply from about 13 May 2027**. These include notice (Rule 3), security, breach intimation, retention and erasure (Rule 8), and rights.

What changes the design:
1. **Standalone, itemised consent notice (Rule 3).**
   - Consent at CV upload uses a separate notice, not the privacy policy.
   - It lists each item of data, ties each purpose to what it enables, and links to withdrawal and complaints.
   - There are separate checkboxes for (a) profile and matching and (b) sharing with hiring companies. Service offers are optional and separate.
   - The notice version and its hash are stored with each consent.
2. **Withdrawal as easy as giving consent.**
   - One click in the consent centre.
   - It takes effect immediately: the candidate is removed from every unreleased match list, and released but not-yet-unlocked previews are revoked (`releases.revoked_at`).
   - The withdrawal is recorded in the ledger.
3. **Already-unlocked copies.** This is my proposal, for legal to confirm.
   - Platform access to the full CV and contacts is **revoked** for every company. They see "The candidate withdrew consent on ‹date›".
   - Companies get an email asking them to delete downloaded copies within 7 days, as their contract requires.
   - Jobboard300 remains responsible for what it controls. Copies already downloaded are subject to the company's own obligations.
   - The unlock row and quota unit stay; they are not refunded, because this is an audit record.

   This differs from downgrade or expiry, where unlocked CVs **stay visible**.
4. **Retaining logs for one year (reported as Rule 8(3)).** Deleting a candidate erases the CV, profile and contacts. Pseudonymous access, release and unlock logs are kept for at least one year, so logs never hold CV content.
5. **Erasure after inactivity.** A profile inactive for 24 months, after a warning at least 48 hours ahead, is erased. That is our policy, consistent with Rule 8.
6. **Breach notification.** Notify the Board without delay, with a detailed report within 72 hours, and notify affected candidates. This needs a runbook (operational, not code) and the stored data to support it.
7. **Processor contracts.** These are needed with hosting and any email, SMS, embedding or AI provider. The existing privacy page already lists these as open items.
8. **Adults only.** The 18+ confirmation stays. There is no child data.
9. **Consent managers.** The ledger is designed so a registered consent manager can be supported later. It is not required in Phase 1.
10. **Missing operating facts.** A named grievance officer and the company's legal entity are still missing from the privacy page. These block live launch, not the build.

---

## 7. Edge cases

| Case | Handling |
|---|---|
| Unparseable or scanned CV | `parse_status = needs_review`. Goes into the admin review queue and the candidate sees "under review". Never dropped and never released until fixed. |
| JD with no CVs at or above min score | "No strong matches yet". No padding. Counts are shown only as "0 strong matches". |
| Duplicate accounts or CVs | Signals: same file hash, same verified email or phone, or near-identical text (shingle similarity of 0.9 or more). Creates a `duplicate_flags` entry. Identical files under one account are auto-merged; across accounts, the admin merges. Releases and unlocks follow the surviving candidate, and a company never pays twice for the same person. |
| Downgrade or expired quota | New unlocks are blocked with an upgrade prompt. Already-unlocked CVs stay visible and downloadable. |
| Consent withdrawn | See §6.2–6.3. |
| Parameter change requested | Has no effect until approved. When approved, live JDs are re-checked. JDs that no longer fit are paused for your review. Matches are rescored, and releases that no longer qualify are revoked unless already unlocked. |
| CV replaced | Rescored. Existing releases are kept if the new score still qualifies, otherwise revoked. |

---

## 8. Screens (Phase 1)

**Candidate**
1. Sign up or sign in (email verification).
2. Upload CV, with the consent notice and checkboxes.
3. Review and correct parsed profile (including CTC, notice, cities, relocation).
4. Matched jobs: ranked, with filters for city, role, CTC and experience, and a "why this fits" note.
5. Job detail and apply.
6. My applications: status tracker.
7. Privacy and consent centre: withdraw, download my data, delete account.

**Company**
1. Request access (company details).
2. Pending approval page.
3. Dashboard: plan, **unlocks remaining**, JDs and their states.
4. New or edit JD: paste or upload, correct the parsed requirements, submit for approval.
5. My matching parameters, with a change request form.
6. JD matches: ranked anonymised previews, or "No strong matches yet".
7. Unlock confirmation, showing the quota cost (or "already unlocked, no charge").
8. Unlocked candidate: full CV, contacts, watermarked PDF download, application status.
9. Upgrade prompt (stub: "Contact Jobboard300 to change plan").
10. Team users (owner invites recruiters).

**Admin** (inside the existing `/admin`)
1. Companies: onboarding queue and company detail (parameters, plan, quota, users, suspend).
2. Parameter change requests, with a diff against the current version.
3. JD approval queue, showing the JD against the approved parameters, with any conflicts highlighted.
4. Candidate review queue: needs-review CVs and duplicate flags.
5. Release and unlock log (filterable, CSV export for you).
6. Abuse flags.
7. Plans (create and edit), assign a plan, adjust quota.
8. Matching overview per JD: score distribution, released count, and a "run scoring now" button.

There are no service screens. The services catalogue is seeded as data only.

---

## 9. Build and test plan (after approval)

Delivered as one PR with reviewable commits, in this order:
1. Migration, accounts and session reuse, consent ledger.
2. Parser extensions (CTC, notice, seniority, cities).
3. Company onboarding, parameters and JD approval gates.
4. Matching queue, hard filters, scoring and explanations.
5. Releases, previews, unlocks, quota and watermark.
6. Logs, rate limits and abuse flags.
7. Candidate screens, then company screens, then admin screens.
8. Seed data and tests.

**Seed data.** 36 fictional Indian-market CVs as real PDF and DOCX files across:
- accounts, sales, customer support, operations and logistics, IT development, HR and admin;
- Durgapur, Asansol, Kolkata, Siliguri and Bengaluru;
- CTC from ₹1.8 to ₹18 LPA, notice from immediate to 90 days;
- 2 scanned, 2 duplicates and 1 keyword-stuffed CV.

There are also 5 JDs from 3 fictional companies on different plans.

**Automated tests (your "done when" list):**
- parsing, including INR CTC and notice formats;
- scoring and explanation present for every match;
- each hard filter;
- account-level quota, including a parallel double-unlock race;
- JD and parameter approval gates;
- the same CV unlocked from two JDs counting once;
- preview redaction (no contact details, employers, institutions or links);
- consent withdrawal across unreleased, released and unlocked states;
- no access outside approved parameters or the unlocked set, probed across every company route with forged IDs;
- downgrade or expiry keeping access to unlocked CVs;
- duplicate detection and scanned CVs going to review.

**Report.** The top 5 matches for two JDs with scores and explanations, for you to judge.

**Only you can check:** real CVs from your own sample, payment integration, legal sign-off on consent text, company terms, the DPDP mapping and the withdrawal policy.

## 10. Risks

- **R1. Quality of semantic matching without embeddings.** Mitigated by the skill graph, and testable with the seed set. Embeddings can be added later.
- **R2. Email provider.** Needed before real candidates can sign up (D2).
- **R3. Background jobs.** It is unconfirmed whether the hosting supports cron, queues or long CPU time. The design drains work in small, request-sized batches either way. Large rescoring may be slower until a cron is available.
- **R4. Legal.** The consent wording, company terms and withdrawal handling need a lawyer before launch. Public intake stays off until then.
- **R5. Scope.** This is a large build of roughly 25–35 new screens and routes. It reuses PR #7 and the platform security code, so PR #7 should be merged first.
