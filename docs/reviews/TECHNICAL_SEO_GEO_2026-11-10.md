# Technical SEO and GEO audit of the public pages (audit and proposals only)

Date: 10 November 2026. Nothing was edited. Every finding was read from the pages the local site serves at `http://127.0.0.1:5173`, then checked against the source to say whether it also holds on the live site.

## Summary

The basics are sound. Every public page returns the right status, has one main heading, a unique title, a description and a canonical address, and the private areas are kept out of search. Four things need attention first:

1. **Job pages hide their title, description and canonical address from AI crawlers** (finding 7). They are sent in the body of the page instead of the head for Googlebot, GPTBot, ClaudeBot and PerplexityBot.
2. **The only live job carries no job listing data for Google** (finding 16). Any job whose company is left as "Confidential client", which is the default, gets none.
3. **The "one free replacement within 60 days" line appears in the share-card text of candidate pages** (finding 8). This conflicts with your decision 4.
4. **Pictures are sent at full size** (finding 31). Phones download a 1448-pixel photo to show it at 350 pixels.

Severity: High = costs visibility now; Medium = fix before promoting the site; Low = tidy-up.

## 1. Indexing rules

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 1 | `/`, `/employers`, `/job-seekers`, live job, `/terms/employers`, `/terms/job-seekers` | `<meta name="robots" content="index, follow"/>` | Pass | None | Yes. The switch `DEMO_MODE` is `false`. |
| 2 | `/privacy`, `/terms`, `/compliance` | `<meta name="robots" content="noindex, follow"/>` and left out of the sitemap | Pass, on purpose (the code calls them drafts). The three pages still say the site is "a read-only demo" although forms are live. | Wording goes to the content editor. When the texts are final, remove `robots: { index: false, follow: true }` from the three pages and add them to the sitemap list. | Yes |
| 3 | `/platform/sign-in`, `/portal/sign-in`, `/portal/register`, `/portal/forgot`, `/portal/verify`, `/portal/accept`, `/portal/reset`, `/test`, `/commit` | `<meta name="robots" content="noindex, nofollow"/>` (staff pages add `nocache`) | Pass | None | Yes |
| 4 | `/admin`, `/candidate`, `/company`, `/platform` | `307` to the sign-in page, e.g. `location: /portal/sign-in?next=%2Fcandidate` | Pass | None | Yes for `/candidate`, `/company`, `/platform`. The `/admin` sign-in is automatic locally, so its live behaviour was not seen. |
| 5 | `/robots.txt` | `Disallow: /admin`, `Disallow: /platform`, `Disallow: /api/`, `Sitemap: http://127.0.0.1:5173/sitemap.xml` | Medium. The footer links to `/platform/sign-in` from every public page, but robots.txt stops crawlers opening it, so they never see its noindex tag. Google can then list the bare address. | Delete the line `Disallow: /platform` in both places in the robots file; the noindex tag (finding 3) does the job. Keep `/admin` and `/api/`. | Yes |
| 6 | Any wrong address (`/no-such-page`, `/jobs/no-such-job`) | Two conflicting tags: `<meta name="robots" content="noindex"/>` and `<meta name="robots" content="index, follow"/>`; canonical points to the home page; title is the home page title | Low. The 404 status is correct, so it will not be indexed. | Add to the not-found page: `export const metadata = { title: "Page not found", robots: { index: false, follow: true } };` Check afterwards that only one robots tag remains. | Yes (same framework code) |

Where: `app/robots.txt/route.ts`, `app/not-found.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/compliance/page.tsx`.

## 2. Canonical and metadata

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 7 | Live job page | For Googlebot, GPTBot, ClaudeBot, PerplexityBot and ordinary browsers, `<title>`, description, robots and `<link rel="canonical">` arrive inside `<div hidden="">` in the body, after the footer. The head has none of them. Bingbot, Facebook, Twitter, LinkedIn and WhatsApp get them in the head. | High. AI crawlers do not run scripts, so they read a job page with no title, description or canonical in the head. | In the site config add one line inside `nextConfig`: `htmlLimitedBots: /.*/,` This makes the framework put these tags in the head for every visitor. Re-test with `curl -A "GPTBot"`. | Yes. The live build uses the same rule and crawler list. |
| 8 | `/job-seekers`, live job, `/terms/job-seekers`, and every other page | `<meta name="twitter:description" content="Jobs for professionals. Screened shortlists for employers, with one free replacement within 60 days."/>` and `twitter:title` is the home page title on every page | High. This is the employer fact on candidate-facing share cards (your decision 4), and every page shares one card title. | In the root layout change the `twitter` entry to `twitter: { card: "summary_large_image", images: ["/images/career-conversation.webp"] }`. On each page add its own, e.g. on the job-seekers page: `twitter: { card: "summary_large_image", title: "Upload your CV and apply for IT and non-IT jobs \| Jobboard300", description: "Register your CV free. A recruiter matches you to IT and non-IT jobs and shares your CV only with your consent.", images: ["/images/career-conversation.webp"] }`. Same pattern for `/employers` and the job page (title `job.title`, description as in finding 12). | Yes |
| 9 | `/employers`, `/job-seekers`, live job | No `og:image`, `og:site_name`, `og:locale` or `twitter:image`. The home page has them. | Medium. A link shared on WhatsApp or LinkedIn shows no picture. | In each page's `openGraph` add: `siteName: "Jobboard300", locale: "en_IN", images: ["/images/career-conversation.webp"]`. | Yes |
| 10 | `/terms/employers`, `/terms/job-seekers`, `/privacy`, `/terms`, `/compliance` | `<meta property="og:url" content="https://jobboard300.dippurajthapa.chatgpt.site"/>` and the home page `og:title` | Low. A shared terms link previews as the home page. | Add to each page's metadata, e.g.: `openGraph: { title: "Terms for employers \| Jobboard300", description: "The terms an employer accepts when sending a hiring requirement to Jobboard300.", url: "/terms/employers", type: "website", siteName: "Jobboard300", locale: "en_IN", images: ["/images/career-conversation.webp"] }`. | Yes |
| 11 | Live job | `<title>Junior Accountant | Jobboard300</title>` | Medium. Two jobs with the same name get the same title; no location in the title. | In the job page metadata use `title: \`${job.title} in ${job.location}\`` (and the same in `openGraph.title`). | Yes |
| 12 | Live job | Description is `job.description.slice(0, 155)` | Low. It can cut a word in half. | Replace with: `const description = job.description.length > 155 ? job.description.slice(0, 155).replace(/\s+\S*$/, "") + "…" : job.description;` | Yes |
| 13 | All public pages | Canonical is present, absolute and correct, e.g. `<link rel="canonical" href="https://jobboard300.dippurajthapa.chatgpt.site/employers"/>`; `/?utm=1` keeps the clean canonical | Pass | None | Yes |
| 14 | All pages | The site address is written three times: once as the shared constant, once by hand in the home page (`const url = "https://jobboard300.dippurajthapa.chatgpt.site"`), while the sitemap, robots.txt and llms.txt use whatever address the visitor typed | Medium. If you move to your own domain, or the site is reachable on a second address, these will disagree. | Home page: replace the hand-written line with `import { SITE_URL } from "@/lib/site";` and `const url = SITE_URL;`. In the sitemap, robots and llms files replace `const origin = new URL(request.url).origin;` with `const origin = SITE_URL;` (plus the import). | Yes |
| 15 | Sign-in and other private pages | Canonical points to the home page; description is the home page description | Low. Harmless because they are noindex. | Optional: add `alternates: { canonical: null }` to the portal and platform layouts. | Yes |

Where: `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/employers/page.tsx`, `app/job-seekers/page.tsx`, `app/jobs/[id]/page.tsx`, `app/terms/**/page.tsx`, `app/sitemap.xml/route.ts`, `app/robots.txt/route.ts`, `app/llms.txt/route.ts`.

## 3. Structured data

All seven JSON-LD blocks served parse without error: home has EmploymentAgency, WebSite and FAQPage (9 questions); `/employers` and `/job-seekers` each have FAQPage (6 questions) and Service. Every question and answer matches the visible page word for word.

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 16 | Live job | No JSON-LD at all. The code skips it when the company is `"Confidential client"`, which is the default when a job is posted without a company name. | High. Such a job cannot appear in Google's job listings. | Remove the `storedJob!.company === "Confidential client"` condition and set `hiringOrganization: job.company === "Confidential client" ? "confidential" : { "@type": "Organization", name: job.company }`. Test the result in Google's Rich Results Test before relying on it. | Yes |
| 17 | Any job with type "Contract" | Type is built by `job.employmentType.toUpperCase().replaceAll("-", "_")`, which gives `CONTRACT` | Medium. Google's accepted value is `CONTRACTOR`. Full-time, Part-time and Temporary come out right. | `const types: Record<string, string> = { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", "Contract": "CONTRACTOR", "Temporary": "TEMPORARY" };` then `employmentType: types[job.employmentType] ?? "OTHER"`. | Yes |
| 18 | Any job page | JobPosting has no `url`, `identifier`, `directApply`, remote marker or `validThrough` | Medium | Add: `url: \`${SITE_URL}/jobs/${job.id}\`, identifier: { "@type": "PropertyValue", name: "Jobboard300", value: job.id }, directApply: true, ...(job.workMode === "Remote" ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "India" } } : {})`. A closing date needs a new "closes on" field on the job; until then leave `validThrough` out. | Yes |
| 19 | Any job page | No BreadcrumbList | Low | Add a second block: `{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Jobs", item: \`${SITE_URL}/#jobs\` }, { "@type": "ListItem", position: 2, name: job.title }] }`. | Yes |
| 20 | Home | The agency description says "…pay 7.5% to 8.33% of annual salary only on a successful placement", and the home FAQ data carries the fee and 60-day questions | Decision needed. This is machine-read data, not a proof strip, but it sits on the general home page (your decision 4). | Suggested: end the agency `description` at "…apply free of charge; employers hire recruiter-screened candidates." Keep the fee inside the "Permanent recruitment" offer, which is employer-specific. If the two employer questions are removed from the home FAQ, the data follows by itself because both read one list. | Yes |
| 21 | Home | Agency data has only `addressLocality: "Kolkata"`; no phone, email, street address or social profiles. WebSite has no `@id`. | Low. It needs facts from you. | When confirmed add `telephone`, `email`, `streetAddress`, `postalCode`, `sameAs: [LinkedIn, …]`, `areaServed: "IN"`; add `"@id": \`${url}/#website\`` to WebSite. | Yes |

Where: `app/jobs/[id]/page.tsx`, `app/page.tsx`, `lib/faqs.ts`.

## 4. Sitemap

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 22 | `/sitemap.xml` | Lists `/`, `/job-seekers`, `/employers`, `/terms/job-seekers`, `/terms/employers` and the one published job with `<lastmod>2026-11-10T16:53:16.761Z</lastmod>` | Pass. Every indexable page is there; nothing private, noindex or redirected. | None | Yes. Local dummy jobs are not in it. |
| 23 | `/sitemap.xml` | The five fixed pages have no `lastmod` | Low | Optional: give each a date that is changed by hand when the page changes. | Yes |
| 24 | Closed or draft job | The code returns the 404 page when a job is not "published", and the sitemap lists only published jobs | Pass from the code. Not seen locally: the database has one job and it is published. | None | Yes |

Where: `app/sitemap.xml/route.ts`.

## 5. GEO: AI crawlers and llms.txt

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 25 | `/robots.txt` | Only `User-agent: *`. GPTBot, ClaudeBot, PerplexityBot and Google-Extended are allowed because nothing says otherwise. | Medium. Allowed by accident, not by decision. | If you want AI assistants to cite the site, add a second group: `User-agent: GPTBot`, `User-agent: OAI-SearchBot`, `User-agent: ChatGPT-User`, `User-agent: ClaudeBot`, `User-agent: PerplexityBot`, `User-agent: Google-Extended`, then `Allow: /`, `Disallow: /admin`, `Disallow: /api/`. The Disallow lines must be repeated because a named crawler ignores the `*` group. | Yes |
| 26 | `/llms.txt` | Served as plain text; links `/job-seekers`, `/#jobs`, `/employers`, both terms pages, `/privacy`, `/terms`, `/compliance`; FAQ comes from the same list as the home page | Pass for accuracy and links. It links three noindex pages that still carry "demo" wording. | None until finding 2 is done | Yes, with the address issue in finding 14 |
| 27 | `/llms.txt` | The opening summary includes "pay 7.5% to 8.33% … with one free replacement if the hire leaves within 60 days" | Decision needed (your decision 4). The same facts are already under "For employers". | Shorten the summary to end at "Employers hire recruiter-screened candidates and pay only on a successful placement." | Yes |
| 28 | `/`, `/employers`, `/job-seekers`, job page | With scripts switched off the pages still show the main heading, all text, FAQ answers and the job links (10 job links on the home page locally) | Pass. Key facts are in the served HTML. | None | Yes; the live site lists only real jobs |

Where: `app/robots.txt/route.ts`, `app/llms.txt/route.ts`.

## 6. Rendering and markup

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 29 | All public pages | One `<h1>` each; heading levels never skip (home runs h1, h2, h2, h3…); all images have alt text; no empty links; no sideways scroll at phone width | Pass | None | Yes |
| 30 | All pages | Icon names are real text inside links and buttons, e.g. the button reads `Hire talent north_east` and the job back-link reads `arrow_back All roles`. They are hidden from screen readers but not from crawlers. | Medium. Search engines can read "north_east" as part of the link text, and visitors see the words if the icon font fails to load. | Icon component: `return <span className={\`material-symbols-rounded ${className}\`} aria-hidden="true" data-icon={name} />;` and add to the stylesheet: `.material-symbols-rounded::before{content:attr(data-icon)}`. | Yes |
| 31 | All pages | `<html lang="en">` while the share tags say `en_IN` | Low | `<html lang="en-IN">` | Yes |
| 32 | `/`, `/employers`, `/job-seekers` | The CV form and the enquiry form open from buttons and have no address of their own. Header and footer links are real `<a href>` links and all their targets exist (`#jobs`, `#about`, `#services`, `#faq`, `#contact`, `/employers#page-terms`). | Pass, with a note for the rebuild: keep these section names, or the header, footer, llms.txt and the job page back-link break. | None | Yes |
| 33 | All pages | The same keywords tag is on every page, private ones included | Low. Google ignores it. | Optional: delete the `keywords` line from the root layout. | Yes |

Where: `components/icon.tsx`, `app/globals.css`, `app/layout.tsx`.

## 7. Speed basics

| # | Page | What was found | Verdict | Exact fix | Also on the live site? |
|---|---|---|---|---|---|
| 34 | `/`, `/employers`, `/job-seekers` | Each picture request answers `302` and forwards to the original file. The top photo is 1448×1086 (120 KB) shown at 350×380 on a phone; the home page loads about 380 KB of photos. | Medium | Simplest: save 800-pixel-wide copies of the four photos and point the pages at them. Alternative: switch on the framework's Cloudflare image resizer, if the hosting plan allows it. | Likely yes. No image resizer is configured in the build, and the framework then serves originals. The live response itself could not be seen. |
| 35 | All pages | One stylesheet from Google Fonts is loaded in the head: five weights of the text font plus the full icon font, with `display=swap`. This is the only third-party request on the public pages. | Medium. It delays first paint, and "swap" shows icon names as words until the font arrives. | Split into two links. Text font: keep as is, with only the weights used. Icons: `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=add,arrow_back,arrow_forward,check_circle,close,handshake,menu,north_east,person_search,refresh,school,search,verified,work&display=block`. Check the icon list against the rebuilt forms first. | Yes |
| 36 | All public pages | Layout shift measured 0.00 on phone and desktop sizes with fonts blocked; the top photo is marked high priority; logos have width and height | Pass locally | None | Field figures cannot be measured locally |
| 37 | Share image | `/images/career-conversation.webp`, 1448×1086 | Low. Share cards are normally 1200×630, so this picture is cropped. | Add a 1200×630 JPG (for example `public/images/share-card.jpg`) and use it in every `images: [...]` above. | Yes |

Where: `app/layout.tsx`, `public/images/`, `vite.config.ts`, `components/landing-page.tsx`, `app/home-client.tsx`.

## 8. Status codes

| # | Address | What was found | Verdict | Fix |
|---|---|---|---|---|
| 38 | Nine public pages, sitemap, robots.txt, llms.txt | `200` | Pass | None |
| 39 | `/no-such-page`, `/jobs/no-such-job`, `/Employers`, `/index.html`, `/portal`, `/jobs` | `404` with a page offering "Browse current roles" and "Go home" | Pass (see finding 6 for the tags) | None |
| 40 | `/employers/`, `/jobs/` | `308` to the address without the slash, one hop | Pass | None |
| 41 | `/admin`, `/candidate`, `/company`, `/platform` | `307` to sign-in, one hop | Pass | None |

These come from the application code, so they hold on the live site. The http-to-https step is done by the hosting and was not testable.

## Risks in the decisions already taken

42. **Call booking (decision 3).** The site's security rules allow no outside frames or outside connections (`frame-src 'none'`, `connect-src 'self'`). An embedded outside calendar such as Calendly or Google Calendar will not load unless those rules are widened. A date-and-time picker built into the form avoids this.
43. **Confirmation screens (decisions 1 to 3).** If the short confirmation becomes its own address, give it `robots: { index: false, follow: false }` and keep it out of the sitemap.
44. **Fee facts (decision 4).** Beyond the visible strips, the fee or the 60-day line also sits in the share-card text on every page (finding 8), the agency description (finding 20) and the llms.txt summary (finding 27).
45. **Header and footer (decision 5).** See finding 5 for the staff link and finding 32 for the section names.
46. **Site address.** All search signals are tied to `jobboard300.dippurajthapa.chatgpt.site`. If you plan your own domain, move before promoting the site; finding 14 makes that a one-line change.

## What could not be checked locally

47. How Google, Bing and AI assistants actually crawl and show the site (Search Console, Bing Webmaster Tools, Rich Results Test, a real crawl).
48. Real-world speed figures (Core Web Vitals) and the live caching and compression headers. The local server sends `no-cache` and loads about 150 separate script files, which is development behaviour.
49. Whether the live hosting resizes pictures (finding 34), and the http-to-https and www redirects.
50. How WhatsApp, LinkedIn and X draw the share cards.
51. A closed job returning 404 (no closed job exists in the test data) and the live `/admin` sign-in redirect.
52. Whether fixes 6, 7 and 16 behave as intended: this pass was read-only, so each needs a re-test after the change.

## Suggested order

First: 7, 16, 8, 17. Next: 9, 5, 14, 34, 35, 30, 25. Then: 11, 12, 18, 19, 10, 6, 31, 37, 21, 23, 33. Decisions for you: 2, 20, 27, 46.
