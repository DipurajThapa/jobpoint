# Blog CMS

Open **Blog CMS** from either the recruitment console or the staff administrator navigation. The direct path is `/admin/blog`. Only the verified site owner or an active Working Platform administrator can author content. Existing staff sign-in remains in the public footer.

## Editorial workflow

1. Create an article; enter its title, URL slug, audience, summary and author.
2. Upload a 1920 × 1080 image or video banner and a meaningful description. Video banners require a 1920 × 1080 image poster. Image dimensions are checked on the server. Video dimensions are read in the browser; the server checks the submitted dimensions and allowed container signature. Images: JPEG, PNG, WebP, up to 8 MB. Video: MP4 or WebM, up to 20 MB. Compress longer videos before upload.
3. Write using the toolbar: H2/H3/H4, paragraphs, lists, quotes, dividers, tables, links, code, bold/italic/underline/strike, colours, fonts, alignment, sub/superscript, undo/redo. Insert images, videos and bar/line charts below the editor. Charts include an accessible data table; use source URLs and accurate figures. Select an inserted video to add its transcript. Click a media/chart node and press Delete to remove it.
4. Add the SEO title/description if different from the article, a direct answer/key takeaway, useful questions and answers, author expertise and evidence links. These are visible editorial content, not hidden keyword stuffing.
5. Save draft, review Preview, then Publish. Draft edits never alter the current live snapshot. Saving requires the latest revision; stale edits return a conflict rather than overwriting another editor. URLs are locked after first publication. Unpublish retains the draft and removes public access to the article and media used only by it.

No fake sample articles are published automatically. The public blog shows an honest empty state until an administrator publishes the first article. Uploads unreferenced by a live article remain authenticated; removing an article from publication is not a substitute for deleting sensitive data that has already been public.

## Search implementation

Public articles render server-side, with one H1, semantic subheadings, canonical URLs, author/date information, Open Graph and Twitter cards, BlogPosting and BreadcrumbList JSON-LD. Video banners add VideoObject metadata. The XML sitemap includes published, indexable article URLs, modification dates and banner image/video metadata. `/blog/feed.xml` supplies an RSS feed. Robots allows blog media paths, while authentication prevents draft access. Noindex articles are excluded from the blog list, feed and sitemap but are still accessible at their URL.

Authoring checks are editorial guidance, not a measured ranking or copy score. AEO/GEO support comes from clear visible answers, sourced claims, author context, meaningful descriptions and structured content. No ranking, rich result or AI citation is guaranteed. Search Console/Bing Webmaster verification and sitemap submission require the owner's accounts; no credentials are embedded or fabricated.

## Security and operations

SQL values are bound. Mutations require administrator identity plus same origin; body/upload limits apply. Rich content uses a server allowlist and React element rendering, not arbitrary HTML. Script/iframe nodes, unsafe links, executable media types and unsaved asset references are rejected. R2 is private; the media route checks publication/authentication and supports video range requests. This is not an antivirus service.

Migration 0025 adds only blog_posts, blog_assets and the unique slug index. Earlier migrations are unchanged. This repository previously lacked Drizzle snapshots; the generated snapshot establishes a baseline for the schema file, while the reviewed SQL is limited to the two new tables. Wider legacy portal tables are managed by their existing SQL migrations; future generated changes still require review.

## Employer meeting requests

The shared registration popup now shows a monthly calendar and available 30-minute slots, labelled IST/UTC+05:30. The existing database unique index prevents duplicate requested/confirmed slots. Confirmation offers Google Calendar, Outlook and a downloadable RFC 5545 ICS file for phone/Apple calendars. These are tentative personal reminders without candidate/employer contact data. Slots are not synchronised with an external staff calendar. Staff confirms/cancels through Employer enquiries; transactional mail must be configured for confirmation emails and account verification.
