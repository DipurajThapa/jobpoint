# CV screening (ATS) — design, operation and limits

> **Retired on 10 Nov 2026 (merge 2 in `WORKFLOWS_AND_MERGE_PLAN.md`).** The CV screening tab and its routes are removed. Candidates are ranked and worked in the Recruiting tool, which uses the portal matching engine. The parsing library in `lib/ats/` is still used by that engine. The two tables are kept as `retired_ats_job_profiles` and `retired_ats_screenings`. The rest of this page describes the tool as it was.

The CV screening tool is a recruiter aid in the **owner-only recruitment console** (`/admin` → **CV screening**). It is not linked from the public website. It is not a Working Platform tool, so team members cannot see it. Every route under `/api/admin/ats/` checks the site owner's sign-in on the server. Every change also requires a same-origin request.

It does three things:

1. **Reads a CV** (PDF or DOCX) into structured JSON: contact details, work history with dates, education, and skills. Each skill records where in the CV it was found, how long it was used and when it was last used. It also records certifications, languages, notice period and CTC.
2. **Reads the client's job description (JD)** into requirements: must-have and nice-to-have skills, years of experience, minimum education and location. A recruiter can edit these, and the edited version is saved for that role.
3. **Compares the two.** The result is an explainable score from 0 to 100 and a recommendation. It comes with a fit-and-gap table, evidence quoted from the CV, strengths, gaps and suggested screening questions.

It never rejects, advances or messages anyone. A recruiter makes every decision and can record whether they agree with each recommendation. Disagreeing requires a reason, and both are audited.

## How it was designed

The design follows how established products handle each part of the job:

- **Parsing:** Textkernel/Sovren, Affinda and RChilli all track, for each skill, where it was found, how many months it was used and when it was last used.
- **Fit and gap:** Workday HiredScore grades each candidate against the requirements and shows met or not met for each qualification. It does not rank applicants against each other.
- **Verdicts:** Greenhouse Talent Matching uses bands (Strong / Good / Partial / Limited / Needs manual review) and never auto-rejects.
- **Weighting:** Zoho Zia and Manatal weight required skills well above preferred ones.

The field names follow JSON Resume where possible.

### Scoring (engine `ats-2026.11.1`)

| Component | Weight | Rule |
|---|---|---|
| Must-have skills | 35 | Full credit when the skill appears in work history, a certification or a project. 0.8 when only in a summary. 0.6 when it appears **only in a skills list**. About 0.4 for a related skill in the same family (for example, Busy for a Tally requirement). 0 when missing. Languages, soft skills and office tools count half as much as core skills. |
| Relevant experience | 20 | Years in roles that match the job's title or core skills, against the stated minimum. Unrelated experience adds at most a quarter. Being over the stated range is flagged, never penalised. |
| Role and title match | 10 | Closest match between the job title and recent titles, the headline or the desired role. Generic level words such as "Executive" carry little weight. |
| Recent relevant work | 10 | Full credit within 24 months, tapering to 0.2 at six years. |
| Nice-to-have skills | 10 | Same credit rules as must-haves. |
| Education | 10 | Only when the role states a requirement. Full credit at or above the level, half credit one level below. |
| Location | 5 | Only for on-site or hybrid roles with a stated city. Cities are compared, not states. |

When the role does not specify a component, that component is dropped and its weight is shared among the others.

**Verdicts**

- **Strong fit:** 75 or above, and every must-have present.
- **Possible fit:** 55–74, or 75 or above with a must-have missing or only related.
- **Weak fit:** 35–54.
- **Not a fit (recruiter to confirm):** below 35.
- **Needs manual review:** overrides everything else when the CV could not be read reliably, for example a scanned image or very little text.

**Keyword stuffing:** a skill listed without any supporting work history earns 0.6 and is flagged "listed only". The report also suggests a question to verify it. Each skill counts once, however often it is repeated.

## Fairness and privacy safeguards

- **Personal characteristics are removed before parsing.** This covers date of birth, age, gender, marital status, religion, caste or category, nationality, family members' names, physical details and identity numbers. They are never stored, scored or shown; the report lists only which kinds of field were removed. Indian CVs often carry a "Personal details" block, so this matters.
- **Career gaps are shown for context only and never scored.** No screening question is suggested about them.
- **CTC and notice period are shown, not scored.**
- **The score is deterministic and versioned.** Each saved screening stores:
  - the CV's SHA-256 hash;
  - the requirements snapshot and engine version;
  - the extraction method (and model, if Claude was used);
  - the full breakdown;
  - the recruiter's review.
- **Audit log entries** record screenings, requirement changes, reviews and one-off checks, without copying CV content. They appear under **Access history**.
- **Deletion:** deleting an application deletes its CV and every screening derived from it.
- **Consent:** general registrations are screened against a role only if the person agreed to be contacted about other roles, and only when the recruiter chooses to include them.
- **Not stored:** a one-off check of a CV from outside the pipeline is not stored.

## Optional Claude-assisted extraction

By default, CVs are read on the server by the built-in parser. No CV leaves Jobboard300's hosting.

If an `ANTHROPIC_API_KEY` secret is configured, the console offers **Use Claude** for each screening. It sends a redacted copy of the CV text to `claude-opus-5-5` for extraction, using structured JSON output and low effort.

- **What is removed before sending:** names, email addresses, phone numbers, links, addresses and personal fields.
- **What Claude does:** the model only extracts. The score is still calculated by the deterministic engine.
- **If it fails:** a refusal, timeout or invalid answer falls back to the built-in parser with a warning.

**Before turning this on for real candidates:**

1. Add Anthropic as a processor in the privacy notice. It currently states, correctly, that no external AI CV screening provider is connected.
2. Confirm the processing terms and the cross-border data transfer.
3. Record this in the processor register required by India's DPDP Act.

## Using it

1. **Open roles:** post the role with the client's job description and requirements.
2. **CV screening → Screen applicants for a role:** pick the role and check the generated requirements. Move secondary skills to nice-to-have, set the years and education, then **Save requirements**.
3. **Screen not yet screened:** this screens every applicant with a CV. Candidates are ranked by score. A screening becomes "out of date" when the requirements change after it; screen it again.
4. **Report:** shows the verdict, the score breakdown, the fit-and-gap table with quoted evidence, strengths, gaps, screening questions and the extracted profile. **Structured JSON** shows or downloads the profile, requirements and result.
5. Record **Your review**, then move the candidate's stage in **Candidate pipeline** as usual.
6. **Check a single CV:** for CVs received by email. Compare against a saved role or a JD pasted from the client. Nothing is stored.

## API (owner only)

| Method and path | Purpose |
|---|---|
| `GET /api/admin/ats` | Roles with applicant and screening counts, pool size, whether Claude is available |
| `GET /api/admin/ats/jobs/{id}?pool=1` | The role's requirements and candidates, ranked by their latest screening |
| `PUT /api/admin/ats/jobs/{id}` | Save edited requirements, or `{ "regenerate": true }` |
| `POST /api/admin/ats/screen` | `{ applicationId, jobId, useAi }`: screen a stored CV and save the result |
| `GET /api/admin/ats/screenings/{id}` | Full report: profile, requirements, result |
| `PATCH /api/admin/ats/screenings/{id}` | Recruiter review `{ decision: "agree" \| "disagree", reason }` |
| `POST /api/admin/ats/analyze` | Multipart one-off check (`resume`, plus `jobId` or `title` + `description`); not stored |

Data: migration `drizzle/0004_ats_screening.sql` adds `ats_job_profiles` (edited requirements) and `ats_screenings`.

## Known limits

- **Scanned PDFs have no text layer** and go to manual review. There is no OCR.
- **Unusual layouts can lose role boundaries:** tables of dates, roles without dates, or text in images. The parse-confidence figure and warnings show when to read the CV yourself.
- **Hidden text is not detected:** white or tiny text in a PDF is read like any other text. The "listed only" rule limits its effect, but it does not remove it.
- **The skills taxonomy needs extending:** `lib/ats/taxonomy.ts` has about 160 skills focused on Jobboard300's sectors. Unknown skills from a CV's skills list are kept as free terms and can still match a requirement worded the same way.
- **Weights are a starting point.** Calibrate them against 30–50 past placements before relying on the bands.
- **CPU time on the host is unconfirmed.** In a local workerd run, reading a two-page PDF took about 0.3 s. Confirm the hosting plan's per-request CPU limit before screening large batches.

## Verification

- `npm run check:ats`: 19 engine checks on fictional CVs. It builds a real two-column PDF with Chromium and a real DOCX, and covers:
  - extraction and parsing;
  - removal of personal fields;
  - redaction before any AI call;
  - JD parsing;
  - scoring of a matching CV, a keyword-stuffed CV, an unrelated CV and a scanned CV.
- `node scripts/check-ats-e2e.mjs`: 28 end-to-end checks against `npm run dev`, through the real intake and admin routes:
  - auth and cross-site refusal;
  - a CV is now mandatory;
  - ranking, the report, reviews, edited requirements and out-of-date flags;
  - the general-registration pool and a one-off check with a pasted JD;
  - deletion cascades, audit entries, and no horizontal scrolling on a phone.

  It needs live intake, so run it only in a local copy with `DEMO_MODE` temporarily set to `false`, and never commit that change.
