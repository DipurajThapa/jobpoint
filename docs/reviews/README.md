# Reviews of 10 November 2026

Eight reviews by the three review agents in `.claude/agents/`. Each one read the code and used the running local site. They reviewed and proposed; they changed nothing themselves.

| Review | Agent | File |
|---|---|---|
| Job seeker on the website | ux-six-sigma-reviewer | [UX_1_JOB_SEEKER_WEBSITE](UX_1_JOB_SEEKER_WEBSITE_2026-11-10.md) |
| Employer on the website | ux-six-sigma-reviewer | [UX_2_EMPLOYER_WEBSITE](UX_2_EMPLOYER_WEBSITE_2026-11-10.md) |
| Portal candidate | ux-six-sigma-reviewer | [UX_3_PORTAL_CANDIDATE](UX_3_PORTAL_CANDIDATE_2026-11-10.md) |
| Client (hiring company) | ux-six-sigma-reviewer | [UX_4_CLIENT](UX_4_CLIENT_2026-11-10.md) |
| Recruiter and team manager | ux-six-sigma-reviewer | [UX_5_RECRUITER](UX_5_RECRUITER_2026-11-10.md) |
| Owner and administrator | ux-six-sigma-reviewer | [UX_6_OWNER_ADMIN](UX_6_OWNER_ADMIN_2026-11-10.md) |
| Content: SEO, GEO, AEO, marketing, sales | content-growth-editor | [CONTENT_SEO_GEO_AEO](CONTENT_SEO_GEO_AEO_2026-11-10.md) |
| Technical SEO and GEO | technical-seo-auditor | [TECHNICAL_SEO_GEO](TECHNICAL_SEO_GEO_2026-11-10.md) |

Each UX review follows the same order: the path as it is (screens, clicks, fields), the findings ranked by cost, the proposals with what could break and how to prove it did not, and what to leave alone.

## What has been applied

From the two website reviews (UX 1 and UX 2), in the same pull request as the new forms:

- Two required ticks kept apart on the candidate form; the consent sentences are held in one place (`lib/portal/notice.ts`) and used by both the form and the consent record.
- "Where you would like to work" is stored as a preferred city. The current city comes from the CV.
- The owner's candidate card shows what was read from the CV.
- Phone numbers are checked; WhatsApp needs a full number.
- Calls are offered from the next day and not between 13:00 and 14:00.
- The confirmation always shows the reference number.
- The pop-up closes only by its button or Escape.
- The owner's "Correct profile" form no longer demands fields the short form does not collect.
- Confirming or cancelling a call emails the employer.

From the portal candidate review (UX 3): replacing a CV no longer turns sharing back on or clears the WhatsApp choice, and a refused file changes no consent.

From the content review: titles, descriptions, headings, FAQs, the employer and job-seeker pages and `llms.txt`, applied by the content editor. Proposals that depend on something not yet confirmed (email delivery, WhatsApp, "within one working day", contract staffing) were left out.

From the technical review: job pages now send their title, description and canonical address in the page head to every visitor; every published job carries job-listing data; share text per page; `Page not found` is kept out of search; AI crawlers are named in `robots.txt`; the site address can be set with `PUBLIC_SITE_URL`.

## What has not been applied

- Everything in UX 4 (client), UX 5 (recruiter) and UX 6 (owner) beyond the items above. These are proposals for the next rounds; many overlap with the audit report's fix groups 2 to 5.
- The legal pages. Both the content review (Part 4) and the audit list where the privacy notice and terms disagree with the product. They need a lawyer.
- Items that need a decision from the owner: whether contract and temporary staffing is offered; whether the fee appears in the home page's hidden business data and in `llms.txt`; a domain of your own; contact details to publish.
- Items that need new files or the live site: smaller pictures for phones, a share image, real crawl and speed figures.
