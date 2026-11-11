# Public intake security and lead quality

Updated 11 November 2026. Scope: public registration, job applications, employer enquiries, privacy requests, account access and CV parsing.

## Implemented controls

- Public intake shares an eight-request hourly IP budget across registration, CV applications and employer enquiries. Privacy requests have a separate budget. Only the trusted hosting IP header is used; submitted forwarded-IP headers do not change the budget.
- Email and phone submissions share four requests per hour and twelve per day across intake endpoints. Verification and reset mail requests share three requests per fifteen minutes and eight per day per email. Account sign-in has both IP and email limits. Contact values are hashed in new counters.
- Streaming request limits apply even without Content-Length, before parsing. Forms reject duplicate field names, excessive fields and oversized text. Authentication request bodies are bounded, including staff sign-in.
- Same-origin checks and honeypots remain enabled. Required consent and terms are validated server-side. Submitted account IDs, roles and active status do not grant privileges.
- Data stays in bound SQL parameters; dynamic query identifiers in reviewed intake/admin paths are application-owned. Public search binds filters. SQL attack strings are tested as literal input, without using a keyword blacklist that would break technical CVs or names containing apostrophes.
- CVs must be PDF or DOCX, within 5 MB. Legacy application uploads now pass the parser before storage. PDF scripts and attachments detected by the parser are refused. DOCX archives have entry, expansion, path and text limits; detected macros, embedded programs, external entities and active fields are refused.
- CV storage remains private and access-controlled. Administrator downloads use attachment disposition, no-store and nosniff headers.
- Unreadable/incomplete CVs, conflicting contact emails and identical CVs across registrations are review prompts, not findings of fraud. Their profiles are marked for review rather than automatically used for matching. The original file and consent remain linked to the applicant.
- Employer enquiries require usable contact details and a meaningful hiring description. Common permanent email providers remain accepted. Only a small explicit list of known temporary inbox domains is refused. Company approval remains a separate step before hiring access.

## Practical limits and follow-up

This is application hardening, not a penetration-test certification or a guarantee against all spam, malware or fraud. A format parser is not an antivirus scanner. Distributed bots can change both IP and contact details; a managed bot challenge and a private malware-scanning service remain possible additional layers. No CVs were sent to a public scanning service.

Email verification proves control of an inbox, not the truth of a CV or a company's claims. Production transactional email is still unconfigured, so new accounts remain pending verification. Recruiters must confirm candidate details, employer identity, job requirements and consent before sharing profiles or introducing candidates.

No attack traffic or synthetic leads were sent to production. Security regression tests use synthetic data and a local database. Browser checks cover navigation, modal entry points and the Blog page. Dependency audit findings are checked separately after updates.

References: OWASP SQL Injection Prevention and File Upload Cheat Sheets:
- https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
