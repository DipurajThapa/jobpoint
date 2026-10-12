# Job Point Consultancy: digital recruitment blueprint

## Decision

Keep the existing website and one-recruiter console as the first operating system. The consultancy needs reliable intake and follow-up before it needs candidate accounts, employer accounts, a native app or AI ranking. Do not create a second workflow alongside the current jobs, applications and enquiries tables.

## Operating path

```mermaid
flowchart LR
  A[Employer enquiry] --> B[Recruiter confirms role]
  B --> C[Publish verified job]
  C --> D[Candidate applies]
  D --> E[Human screening]
  E --> F[Consent check]
  F --> G[Employer shortlist]
  G --> H[Interview and offer]
  H --> I[Placement or closure]
```

The recruiter owns the decision at screening, shortlist, employer submission and offer stages. Candidate stages in the existing admin console are `new`, `screening`, `qualified`, `shortlisted`, `submitted`, `interview`, `selected`, `offer`, `joined`, `rejected`, `withdrawn` and `on_hold`. The employer enquiry stages remain `new`, `contacted`, `in_progress` and `closed`.

## What is built now

| Capability | Decision | Current implementation |
| --- | --- | --- |
| Branded public website and service pages | Must have | Responsive Talentraa-inspired design, Job Point logo system, relevant original imagery |
| Jobs and individual job pages | Must have | Owner-managed draft/publish/close, public search, job detail and appropriate structured data |
| Candidate intake and CV storage | Must have | Structured fields in existing application records, optional private R2 CV, separate consent choices |
| Employer requirement intake | Must have | Existing enquiry flow and owner review |
| Recruiter pipeline and search | Must have | Existing console extended with status stages, notes, name/email/location/skill/role search and possible-duplicate flags |
| Privacy operations | Must have | Request queue, identity verification step, retention review indicators and owner audit events |
| Website SEO and GEO | Must have | Descriptive pages, FAQ and organization schema, published-role sitemap, robots guidance |
| Candidate and employer accounts | Later | Manual communication is sufficient for a small team; role-based access model required before launch |
| Native mobile app | Avoid for now | Responsive website first; measure candidate mobile usage before deciding on a PWA or app |
| AI screening or automatic rejection | Avoid for now | No scoring, automatic rejection or CV text sent to third-party AI |

## Application quality

Required contact and experience fields, adulthood confirmation, form honeypots, same-origin checks, file validation, size limits and hourly request limits reduce poor submissions. An identical email-to-role application within 24 hours receives an explicit duplicate response rather than silently replacing a CV or adding another record. Repeated emails across records are flagged for a recruiter; no profile is merged or rejected solely by email, since email ownership is not verified. The recruiter checks eligibility and fit in context and records notes. Do not infer protected characteristics from a CV.

## Architecture

- Frontend and API: existing React/Vinext Worker on Sites.
- Data: existing D1 jobs, applications and employer enquiries, extended with structured fields and a privacy request/audit table.
- Documents: private R2 objects with authenticated owner-only download. No public CV URLs.
- Authentication: Sites sign-in with explicit owner check on each admin route. No separate login stack.
- CMS: the current admin job editor manages vacancies. Service copy remains in source until updates become frequent.
- Search: D1 text filters over recent records for the first release. A dedicated index becomes useful only after real volume justifies it.
- Mobile: responsive web first. PWA is a later usability improvement; native apps would create extra maintenance and store obligations.
- Analytics: privacy-light aggregate server counts can be added after launch; no third-party behavioural tracker is included.

## Build, buy or integrate

The custom site gives Job Point ownership of its branded public journey and simple internal workflow. Agency ATS products already provide parsing, client portals, candidate search and automation. Zoho Recruit documents staffing-specific plans, parsing and client collaboration; Manatal and Recruit CRM document agency pipelines and candidate databases. Evaluate a controlled ATS trial if weekly application volume, recruiter count or client coordination outgrows the present console. Do not build a second ATS and sync personal data between systems without a clear migration and processor assessment.

Potential later integrations are transactional email acknowledgements, calendar invites and a verified WhatsApp Business provider. Each needs consent, sender identity, security/processor review and real operating demand. Avoid unsupported LinkedIn scraping and unreviewed bulk CV exports.

## Phase gates

1. **MVP:** finish legal/operator details, security review, restore test, malware scanning decision and Sites deployment. Publish real vacancies only; run recruiter-led screening.
2. **Phase 2:** candidate master profiles with verified email, duplicate reconciliation, configurable job questions, acknowledgement email and appointment reminders after volume supports them.
3. **Phase 3:** candidate/client accounts, carefully assessed ATS integration or migration, explainable matching suggestions with human review. Consider mobile app only with demonstrated user need.

## Privacy and operating controls

The company must name its legal entity and privacy contact, confirm whether recruiting is domestic only or includes international placement, agree retention and deletion rules, review its processor/hosting location and contracts, set backup/restore responsibilities, establish breach response, and review any licensing obligations. Candidate consent for application processing, future contact and employer sharing is separately recorded. Rights requests require identity verification before disclosure or change. The admin console flags records after 12 months of inactivity for manual review; it does not silently delete them.

India's DPDP Act and 2025 Rules have phased commencement: the November 2025 Gazette sets key processing provisions and Rules 3, 5–16 for 18 months after publication. Build toward those safeguards now; a legal reviewer must confirm the business-specific obligations and other applicable law before public intake. Overseas placement may require additional Indian recruiting-agent obligations, which should be assessed only if that service is actually offered.

### Primary sources checked 13 October 2026

- [DPDP Act, 2023](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023-1.pdf)
- [Commencement notification G.S.R. 843(E), 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [DPDP Rules, 2025, G.S.R. 846(E)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [West Bengal Labour Commissionerate services](https://labour.wb.gov.in/lc/e-services)
- [Ministry of External Affairs: recruiting agents](https://www.mea.gov.in/ras.htm)
- [Zoho Recruit staffing plans](https://help.zoho.com/portal/en/kb/recruit/zoho-recruit-fundamentals/zoho-recruit-editions/articles/staffing-edition-plans), [Manatal agency features](https://www.manatal.com/recruitment-agencies), [Recruit CRM features](https://recruitcrm.io/features/)

## Legal and operating review: 13 October 2026

The following is a readiness assessment for the India recruitment scope currently described, not legal certification. Actual entity structure, activities, jurisdiction and provider agreements must be assessed by the company and a qualified adviser.

| Area | Website action | Remaining company or hosting decision |
| --- | --- | --- |
| IT Act/SPDI rules, where applicable | Itemised data/purpose, intended recipients, correction/withdrawal channel and sensible sensitive-data exclusions | Confirm registered collecting/retaining entity, full address, named grievance officer and contact; implement applicable grievance deadline (the 2011 rules specify one month) and documented security programme |
| DPDP phased commencement | Separate consent choices, purpose notice, rights queue, human review, audit events | Check launch-date applicability, lawful purpose, rights response deadline, retention duties and processor safeguards. The November 2025 notifications phase key duties/rules in after 18 months; do not describe all of them as already effective |
| Security incidents and logs | Restricted access, private files, audit records | Assess CERT-In directions for the actual entity: report specified incidents within six hours, designate a contact and retain required ICT logs for 180 days in India. Current Sites log location/retention has not been verified; a brief IP rate-limit table is not an ICT security log or a substitute for this duty |
| Transfers and processors | Policy identifies Sites/Cloudflare hosting and Google font requests | Confirm processor contracts, region/subprocessor information and transfer safeguards. The 2011 rules address equivalent protection for transfers; do not claim India-only storage without evidence |
| Recruitment services | Genuine-role review, no guarantee of placement, no public database access, separate employer agreement | Confirm agency registration and services offered. Overseas recruitment needs a review of MEA/eMigrate recruiting-agent requirements; no licence is claimed |
| Retention/deletion | Twelve-month manual review indicator and selected live record/CV deletion | Approve purpose-based schedule, exceptions, recipient deletion and backup handling. Review is not an automatic purge and twelve months is not asserted to be a statutory period |
| Access and communications | One existing console, submission references and manual follow-up | Provide an approved Job Point recruiter email for access. No automatic email or WhatsApp notification is configured; keep one recruitment workflow when adding a provider |

Additional primary sources: [2011 SPDI Rules (official Gazette text reproduced by WIPO)](https://www.wipo.int/wipolex/en/legislation/details/15063), [MeitY/PIB clarification](https://www.meity.gov.in/writereaddata/files/PressNote_25811.pdf), [CERT-In directions of 28 April 2022](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf).
