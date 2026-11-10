# Jobboard300: product review and roadmap for IT hiring

9 November 2026. This document covers:
- what the website can and cannot do today;
- what a complete IT recruitment consultancy needs;
- what was built in this round (the client workspace and IT skills);
- a design for keeping placed candidates engaged over the long term.

Research behind it, with sources and confidence levels:
- [research/it-consultancy-2026-11-09.md](research/it-consultancy-2026-11-09.md): service lines, client portals, Indian IT hiring facts, tenure, free learning programmes, keeping candidates warm, skill taxonomies;
- [research/portal-india-hr-legal-2026-11-09.md](research/portal-india-hr-legal-2026-11-09.md): portal pricing and DPDP;
- [research/portal-matching-design-2026-11-09.md](research/portal-matching-design-2026-11-09.md): matching and assessments.

Figures marked *unverified* in the research are not treated as facts here.

---

## 1. What the website does today

| Area | Who uses it | What it does |
|---|---|---|
| **Public website** | Anyone | Services, roles, FAQs, privacy, terms. Role search from D1. Application form (CV mandatory), employer enquiry form and privacy request form, all **switched off** while `DEMO_MODE = true`. Job pages carry search-engine data. |
| **Recruitment console** (`/admin`) | Owner only | Post roles. Review applicants and employer enquiries, with notes and stages. Handle privacy requests. Access history. |
| **CV screening (ATS)** | Owner only | Reads a CV into structured data, compares it with a job description, and gives an explained fit score. A recruiter decides. |
| **Job portal: admin** | Owner only | Invite or approve clients, set each client's matching rules, approve jobs and rule changes, plans and unlock quota, CV review queue, duplicates, abuse flags, test attempts on hold. **New:** managed searches with candidate submission, and placements with their guarantee dates. |
| **Job portal: client** (`/company`) | Client staff | **New:** overview dashboard, pipeline, interviews, offers and joining, hires with replacement guarantee, team. Existing: post jobs, anonymised matches, unlock a profile, watermarked CV download, request rule changes. |
| **Job portal: candidate** (`/candidate`) | Candidates | One page, "My CV and privacy": upload or replace a CV, correct what was read, turn sharing with employers on or off, hide from named companies, export, delete. Job browsing and skill tests are hidden. |
| **Working Platform** (`/platform`) | Jobboard300 team | Signed-in internal tools. Today: Email Kit for employer outreach, with a Do-not-contact list. |

Quality checks:
- 43 domain checks, the seed-set ranking check, 21 CV screening checks, and 83 browser checks against the running app.
- The browser checks include probes showing that a company cannot reach another company's candidates, files, pipeline or interviews.

## 2. What it cannot do yet

Ordered by impact on an IT recruitment business.

1. ~~**Two separate candidate databases.**~~ **Done (9 November 2026):** website applications now join the same candidate list as portal sign-ups. Matching and sharing follow exactly what each person ticked. See PORTAL.md, "One candidate list".
2. **Live intake and email are off.**
   - `DEMO_MODE` disables the public forms.
   - Portal registration is closed until `PORTAL_OPEN=true`.
   - No email provider is configured, so the client sign-in links built this round have to be copied and sent by hand.
3. **No invoices or payments.** Plans and quota work, but payment is a stub. Placement fees (8.33–12.5% of CTC is common) are tracked only as free-text "fee terms". There are no GST invoices yet.
4. **No calendar, WhatsApp or SMS.**
   - Interviews are recorded, but no calendar invitation (.ics) or reminder is sent.
   - WhatsApp messages need opt-in and Meta's message templates.
   - SMS needs TRAI DLT registration.
5. **Skill tests are multiple choice only.** There are no coding tests. GitHub and portfolio links are read but not used as evidence.
6. **No background verification (BGV) or reference checks.**
7. **No client reports to export.** Clients have no PDF or Excel status reports and no time-to-hire report by job.
8. **Public website copy is general, not IT-focused.** It describes permanent recruitment, contract staffing and candidate guidance. It does not show IT specialisms, tech stacks or the client portal.
9. **Employer enquiries do not become clients automatically.** You can now invite a client in one step, but not straight from an enquiry.
10. **Legal and operational gaps.** Grievance officer, legal entity, counsel review of consent and company terms, and the e-Gazette check on the DPDP timeline are all still open (see [PORTAL.md](PORTAL.md)).

## 3. What a complete IT recruitment consultancy offers

From the research (section 1 there). Fees are indicative and mostly from vendor sources.

| Service | Typical terms in India | For Jobboard300 |
|---|---|---|
| Permanent IT placement | 8.33% (entry) to 8.33–12.5% (mid) of annual CTC, invoiced on joining. 60–90 day replacement guarantee. | **Now.** The core service. The pipeline, placements and guarantee tracking built this round support it. |
| Fresher and campus hiring | Per-hire or per-drive fees | **Now.** Local colleges in and around Kolkata. Needs bulk CV intake and an online test round. |
| Background verification (resold) | About ₹1,200–3,000 per candidate for a standard package | **Now/next.** Partner with a BGV vendor. Record consent and results, not raw EPFO data. |
| Interview-as-a-service | About ₹2,000–2,500 per technical interview | **Next.** Freelance senior engineers, using the interview records built this round. |
| Contract-to-hire (C2H) | Conversion terms vary (for example 1–2 months' CTC, or free after 6–12 months). Fix them in the contract. | **Next, small scale.** |
| Contract staffing | Markup of roughly 8–20% on CTC. Jobboard300 becomes the employer: PF/ESI, working capital, 18% GST. The OSH Code licence applies from 50 contract workers. | **Later.** |
| RPO, executive search, US bench sales | Different economics and skills | **Avoid for now.** |

**What clients expect from an agency portal.** This is the research summary of Zoho Recruit, Recruit CRM, JobAdder, Manatal, Bullhorn and Loxo.
- **Table stakes:**
  - multi-user login per client;
  - shortlists with contacts hidden until approved;
  - approve or reject with reasons;
  - stage view per job;
  - interview scheduling and feedback;
  - offer and joining tracking with the guarantee clock;
  - an audit trail.
- **Nice to have:**
  - white-label branding;
  - CV-viewed tracking;
  - client-created jobs;
  - PDF or Excel reports;
  - invoices in the portal.

## 4. Built in this round

### Client login and dashboard (consultancy clients)

- **Clients can sign in now, without opening public registration.** In the admin console, **Invite a client** creates an active client with its matching rules, plan, replacement-guarantee days, non-solicitation months and fee terms. It produces a one-time link (valid 7 days) for the owner to set a password at `/portal/accept`. If email is configured, the link is also emailed.
- **Team.** The client's owner adds colleagues, who get one-time links, and can issue a new link or remove someone. Colleagues cannot manage the team or request rule changes.
- **Overview dashboard.**
  - candidates in process and how many are waiting for review;
  - interviews in the next 14 days, and past interviews still missing feedback;
  - offers accepted and waiting to join, with the next check-in (30, 14, 7 and 1 days before joining);
  - hires, and whether each is inside the replacement guarantee;
  - a hiring funnel;
  - median days to offer and to joining, offer acceptance rate and no-shows.
- **Pipeline** for every unlocked or Jobboard300-submitted candidate:
  - stages: Submitted by Jobboard300 → Shortlisted → Interviewing → Offer made → Offer accepted → Joined;
  - closed outcomes (Not selected, Offer declined, Did not join, Withdrawn) need an IT-specific reason code, so you learn why candidates drop out;
  - interviews have rounds (coding test, Technical 1 and 2, managerial, HR), date, mode, interviewer, outcome, a 1–5 rating and feedback.
  - Offer acceptance records the expected joining date, **last working day** and **other offers in hand**. The research finds roughly 25–35% of accepted offers fail to convert in Indian IT. That figure is a range from vendors, not verified.
- **Joined creates a placement.** It records the joining date, CTC, the end of the replacement guarantee, and the date before which Jobboard300 must not approach the person about other jobs (the client's non-solicitation period, default 12 months). The client can report an exit, and an exit inside the guarantee is flagged as "replacement due".
- **Managed searches.**
  - When posting a job, a client can choose "Jobboard300 recruits and submits a shortlist".
  - In the admin console you see the best-matching candidates with names and submit one with a recruiter note.
  - This needs the candidate's consent to share and respects the companies they have hidden. It uses no unlock quota; the fee is on placement.
- **Privacy is kept.** When a candidate withdraws consent, their pipeline entries show "Candidate withdrew consent" with no details, and scheduled interviews are cancelled. Deleting an account erases the pipeline notes and interview feedback, but keeps the placement row as the consultancy's business record. Counsel should confirm that retention.

### IT skills
- The skill list now has 90 IT skills, up from 36. Frameworks are separate from their languages: Spring Boot, .NET, Next.js, Kubernetes, Kafka, Terraform, Selenium, PostgreSQL and others.
- A job asking for Spring Boot is no longer satisfied by "Java". A CV showing Spring Boot also earns Java.
- Words that are everyday English or banking terms ("SWIFT transfers", "iOS users", "spring") do not create IT skills unless they appear in a skills section.
- Labels follow ESCO and O\*NET, which may be reused commercially with attribution. Lightcast was avoided: its free tier is non-commercial.

## 5. Your long-term idea: keep placed candidates warm and help them grow

### What the evidence says about timing
- **Tenure.** Indian software engineers stay a median of about **1.4 years** (Xpheno; we saw only a search extract). Gen Z's first-five-year tenure averages **1.1 years** (Randstad 2025). Big-firm attrition is now 12.7–13.8% a year (TCS, Infosys, Wipro, HCLTech, Q2 FY27).
- **When people start looking.** No study measures this. With notice periods of 60–90 days, a 1.4-year tenure implies people start looking at **about 12–15 months**. That is an inference, not a fact.
- **The client contract.** Agency agreements usually stop the agency approaching placed people for about **12 months**. Indian courts treat 6–12-month non-solicitation as reasonable. Breaking it would cost Jobboard300 the client.

**Decided (9 November 2026): job openings start at 18 months after joining, as the owner chose.** That is after the usual 12-month non-solicitation period. Learning and check-ins start much earlier, so Jobboard300 stays in touch through the 12–15-month window when people may begin looking.

### Proposed programme ("Jobboard300 Career Care")

| When (after joining) | What | Why |
|---|---|---|
| Week 2 and month 3 | Settling-in check-in: a short form or call | Protects the replacement guarantee (60–90 days) and shows the client Jobboard300 cares about retention. |
| Months 1–12 | Learning only: a monthly curated path for their role and stack, plus free certifications (below). No job offers. | Builds goodwill inside the non-solicitation period. |
| Month 6 (freshers and 0–3 years) | Career check-in: skills gained, goals | Early-career people move fastest. |
| Month 12 | Career review: skills gained, interests, goals. No job offers. | Keeps the relationship warm when people may start looking, without pitching jobs. |
| Month 18 onwards | Matched openings: only roles that fit their stated goals, a few at a time | The owner's decision. It is also safely after the non-solicitation period. |
| Every 12 months | Re-confirm consent; offer to update the CV | DPDP requires consent to be specific and withdrawable. Stale data should go. |

**Free learning to recommend.** Verified to exist in 2026; details and caveats are in the research.

| Programme | Free part | Paid part |
|---|---|---|
| SWAYAM/NPTEL | All course content | ₹1,000 exam per course |
| AWS Educate and AWS Skill Builder (free tier) | Courses | Cloud Practitioner exam $100 |
| Microsoft Learn | All training | Exams, e.g. AZ-900 about ₹3,691; free vouchers only at time-limited events |
| Oracle University | Foundations courses and certifications, plus OCI Architect Associate in 2026 | — |
| Cisco Skills for All | Courses with badges | — |
| freeCodeCamp | Full Stack certification | — |
| Infosys Springboard | Free courses | — |
| NASSCOM FutureSkills Prime | Many foundation courses | Paid deep-skilling, with a government incentive of about ₹12,000–14,500 per learner (exact cap unverified) |

FutureSkills Prime is the one programme with a clear training-partner route for a small Indian firm: worth an enquiry. Microsoft Learn has a free catalogue API (it needs a Microsoft Entra ID login) that could automate recommendations later. The others have no public API, so keep a curated list and re-check it quarterly.

**Consent and channels.**
- Three separate tick-boxes, separate from job applications: (a) talent community and career check-ins; (b) learning updates; (c) job alerts.
- The portal already has a `service_offers` consent and the ledger to support more purposes.
- Withdrawal is one click. Purge after 24 months of inactivity. That period is a policy choice, not law.
- **Email:** bulk-sender rules need SPF, DKIM, DMARC and one-click unsubscribe.
- **WhatsApp:** opt-in required; marketing templates cost about ₹0.86 per message plus GST, utility templates about ₹0.115.
- **Calls and SMS:** TRAI rules apply.

**What is already in place.** Each placement stores its joining date, guarantee end and non-solicitation end, so the timeline above can be computed. The candidate's skills, role family and seniority come from their profile, and the services catalogue (CV writing, training) and orders tables exist.

**What to build** (2–4 weeks, after email is configured):
1. Three new consent purposes on the candidate side.
2. A `learning_paths` table: role family and skill → curated links, reviewed quarterly.
3. A `care_touchpoints` table: placement, due date, type, status. It is generated from the timeline above, and **job openings are blocked until 18 months after joining, and never before `non_solicit_until`**.
4. An admin "Career Care" queue of check-ins due this week.
5. Monthly email digests: learning path, plus matched openings once allowed.
6. Measure: did people engage, and did they come back through Jobboard300? Check with your own data whether 18 months is the right moment, and adjust.

**Possible revenue.** Offer clients a paid "retention support" add-on: learning paths and check-ins for the people Jobboard300 placed with them. Clients care about attrition, and this turns the programme from cost into service. It needs client agreement and must never be used to move their people out.

## 6. Roadmap

| When | Product | Business |
|---|---|---|
| **Done (this branch)** | Client sign-in by invitation, team, overview, pipeline, interviews, offers and joining, placements with guarantee and non-solicitation dates, managed searches, IT skills | — |
| **Next 2–4 weeks** | ~~One candidate record for website and portal~~ (done). Email provider (ZeptoMail). Calendar invitations for interviews. Client report export. IT-focused public site copy. "Invite as client" from an employer enquiry. | Legal review; switch `PORTAL_OPEN`. Set fee and guarantee terms per client. First clients invited. |
| **1–3 months** | Career Care: consents, learning paths, check-in queue, digests. Coding tests (partner or simple in-house). BGV consent and status tracking. GST invoices for placements. | BGV partner. FutureSkills Prime enquiry. Campus drives. Interview-as-a-service pilot. |
| **3–12 months** | WhatsApp utility messages (interview and joining reminders). Microsoft Learn API recommendations. Client analytics (time to fill by stage, drop reasons). White-label client portal. | C2H pilot; contract staffing only with PF/ESI, working capital and the licence in place. |

## 7. Decisions

1. **Candidate dashboard: decided.** You said a candidate dashboard is not really needed.
   - Candidates still need a place to give or withdraw consent, export or delete their data, and upload or update a CV. DPDP requires the first three.
   - **Done (9 November 2026):** `/candidate` is now one page, **"My CV and privacy"**. Job browsing, applications and skill tests are hidden from candidates. Their server endpoints remain, so they can be brought back later.
2. **Default client terms.** The defaults are a 60-day period with one free replacement (fee 7.5% to 8.33% of annual salary on a successful placement) and 12-month non-solicitation. Adjust them per client in the admin console.
3. **Career Care timing: decided.** Learning starts from month 1, a career review at month 12, and job openings from month 18.
