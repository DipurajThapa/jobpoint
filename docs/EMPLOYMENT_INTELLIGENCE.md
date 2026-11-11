# Jobboard300 Employment Intelligence (supervised launch)

## Scope and current state

Admin-only route: `/platform/intelligence`. This is a research and editorial decision board, not an automatic publisher or a job-listing feed. The existing `/admin/blog` remains the only CMS publishing interface.

- `intelligence_sources`: source URLs and manual trust reviews. Four official-domain candidates are seeded as **unreviewed**; no RSS endpoint is assumed.
- `intelligence_opportunities`: editorial pipeline, audience, priority, primary/corroborating links, verification notes, optional Blog CMS slug. An editorial status never changes a Blog CMS publication state.
- `blog_posts`: existing draft and published article snapshots, read-only in this dashboard.
- `blog_engagement_daily`: first-party counters for published article views and job-search/employer CTA clicks; no IP, cookie, CV or person identity is stored in these aggregate rows.

## Operating workflow

1. A separate daily ChatGPT research schedule prepares a sourced brief, one review draft where evidence permits, and a JSON packet. The existing LinkedIn company-Page research schedule is unchanged.
2. An administrator reviews the findings, pastes the JSON packet into **Import supervised research packet**, and confirms. Imports force sources to `unreviewed` and opportunities to `researching` regardless of the packet's claimed status. The dashboard never imports automatically.
3. An administrator checks original documents, dates, independent corroboration, copyright and originality before advancing a record. The form requires two different-source HTTPS links and written notes for `verified` and subsequent non-rejected editorial states. Domain difference is only an input gate, not proof of independent reporting.
4. A human editor writes and saves the article in `/admin/blog`, optionally associates the CMS slug with the opportunity, and separately decides whether to publish. The dashboard displays actual `blog_posts.published_json` state.
5. Engagement counts become available only after a real article is published and readers view it or use the designated calls to action. Counts measure recorded events, **not** unique readers, qualified leads, hires or SEO performance. Browser blocking, shared IP throttling and automated requests can affect counts.

## Access and safety

- Admin authentication required on the dashboard and the `/api/platform/intelligence` GET/POST API; mutations also require same-origin requests. Writes create audit records.
- Public `/api/blog/engagement` accepts only same-origin POST for actually published slugs, with an event allowlist and per-source connection throttle. It stores daily aggregates only.
- No automatic or programmatic CMS publishing credentials, content generation API keys, paid services, AI model dependency or scraping worker are introduced.
- The daily research schedule can prepare drafts but cannot write to this dashboard or the live CMS. This limitation is intentional during the supervised period.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Targeted API integration tests are in `tests/intelligence.test.mjs` and cover unauthorised access, origin checks, source status, evidence input gates, draft isolation and engagement limits.

## Next controlled increment

After several supervised research cycles, assess evidence accuracy, editorial time, duplicates, and actual content engagement. Only then consider a signed, least-privilege ingestion integration that saves **drafts and unreviewed records** directly. Autonomous publication is deliberately out of scope without a separate explicit decision and safety review.
