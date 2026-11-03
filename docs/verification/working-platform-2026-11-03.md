# Working Platform and Email Kit — verification record (3 November 2026)

## Status

| Item | State |
|---|---|
| Implementation | Built and committed on branch `claude/fervent-albattani-fbii0e`. |
| Local verification | Passed. 128 end-to-end checks against the dev server (`npm run dev`, Miniflare D1 and R2), production build, and a smoke test of the built Worker (`npm start`, workerd). |
| Deployed | **No.** Publishing goes through the OpenAI Sites control plane, and this session has no Sites credentials. Nothing is live until the owner publishes. Publishing applies `drizzle/0002_working_platform.sql`. |
| Real client data | None used. All people, companies and emails in tests are fictional (`example.test`, `.example`). No email or message was sent; the browser tests block every request that leaves `127.0.0.1`. |

## What was run

| Check | Result |
|---|---|
| `scripts/check-platform.mjs` (browser + API, full journey) | **128 passed, 0 failed**. Full list: [working-platform-results.txt](working-platform-results.txt) |
| `npm run build` | Passed. Migration copied to `dist/.openai/drizzle`. The `seedy@sites.test` dev identity is absent from the server bundle. No Email Kit code or content is in the public client bundle. |
| Built Worker smoke test (`npm start`) | Anonymous `/platform` → 307 to sign-in. Anonymous state API → 401. Owner API with forged dev identity → 404. Sign-in → 200 (PBKDF2 in workerd). Email Kit page → 200 with nonce CSP. Records persisted. |
| `scripts/check-demo.mjs` | PASS: 32 demo intake, admin authorisation and crawler checks. |
| `scripts/check-local-dummy-jobs.mjs` | PASS. |
| `scripts/check-navigation.mjs` | PASS: 41 links resolve to 14 routes. |
| ESLint on new code | 0 errors. 2 warnings: intentional full-page navigations after sign-in. The site's existing files keep their earlier lint errors, which this work did not change. |

## Coverage of the requested checks

| Requested | Evidence (sections of the results file) |
|---|---|
| Administrator access management | Owner creates the first administrator. Invitations with per-tool levels. Duplicate email refused. Self and last-admin protection. Role and level changes. Disable, delete, reset links. Activity log. |
| Authorised sign-in | Invitation acceptance leads to the dashboard. Sign-in by UI and API. Password change. Reset with a new password. |
| Denied access | Anonymous: 4 pages redirect with no records. 7 GET APIs → 401 with no data. 9 mutating APIs → 401, and → 403 without same origin. Member without the tool → 403 page with no app and no data, API → 403. Non-admin → no team list, team API → 403. One-time links cannot be reused. Disabled account cannot sign in, and its existing session stops working. |
| Tool-specific permissions | View: read-only banner, drafting and setup hidden, every write → 403, upload → 403. Edit: daily steps allowed. Agency profile, settings smuggling and erase-all → 403. Manage: settings and restore. Revoking Email Kit takes effect on the next request. |
| Email Kit main workflows | Agency setup. First message → mark as sent. Shared records between users. Reply → opt-out → Undo → opt-out again. Restriction lift with reason (audited). Follow-up falls due on a later date and is drafted by the person continuing it. Attachment upload, download and in-use protection. Data persists across reloads and users. Concurrent write → 409 stale. |
| Safeguards (server-side) | Restriction delete, narrowing (keys, channels, scope), move to another person, unknown status, and lift without reason are all refused. An ordinary step cannot delete history. |
| Data persistence and migration | A protected backup was produced **by the original Usha 3.0 standalone app** (`Usha-3.0.html`, SHA-256 `3339b8e2…`) with 2 conversations and 1 company-wide opt-out. A wrong passphrase changed nothing. The restore check showed 0 rows not stored for every record type. Server counts grew by exactly the backup's conversations and restrictions. The migrated company-wide opt-out blocks new outreach. Other team members see the migrated records. |
| Sign-out | From the Email Kit bar it returns to sign-in, clears Email Kit browser data, and the platform needs sign-in again. |
| Mobile usability | At 360 px, sign-in, dashboard, Team access and Email Kit have no element outside the viewport. Screenshots were taken at 2×. |
| Public website regression | `/`, `/privacy`, `/terms`, `/compliance`, a job page and `/api/jobs` → 200. Public intake stays read-only (503). `/admin` still requires the site owner. |

## Failures found and fixed during testing

1. **Credentials could appear in a URL.** If the sign-in page's script had not
   loaded yet, the form fell back to a GET request with the password in the
   query string. Fixed: every credential form now posts to the server and
   works without JavaScript.
2. **`next/link` in a server page broke the sign-in page** in this Vinext dev
   build. Replaced with a plain link.
3. **Mobile overflow** on Team access at 360 px (grid minimum widths). Fixed.
   The layout test now measures every element, because the site hides
   horizontal overflow on `<body>`, which had hidden the problem.
4. **Icon font fallback.** When the icon font fails to load, its ligature text
   overflowed nearby labels. The icons are now clipped to their box.
5. **Email Kit top bar overlapped** the app's sticky panel. The bar now scrolls
   with the page.
6. Test-harness issues (not product defects): a test password contained the
   email name, and the local reset removed Miniflare's R2 folder while it was
   running.

## Not verified here (deployment checks for the owner)

- **Edge header stripping.** `/platform/owner`, like the existing `/admin`,
  trusts the `oai-authenticated-user-*` headers set by the Sites edge. Locally
  the Worker cannot show that the edge removes forged headers. After
  publishing, run the command below. It should return 404.
- **CPU limit for sign-in.** PBKDF2 uses 100,000 iterations. If the Sites
  plan enforces a 10 ms CPU limit, sign-in returns 503. Check with one sign-in
  after publishing.
- Physical phones, Safari and Firefox, and screen readers were not tested;
  only Chromium was.
- The upstream Usha suites (215k composition scenarios and others) were not
  re-run. The drafting rules (`rules.js`, `library.js`, `config.js`) changed
  only in user-facing names.

The header-stripping check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<site>/api/platform/owner -H "origin: https://<site>" -H "content-type: application/json" -H "oai-authenticated-user-id: x" -H "oai-authenticated-user-email: dipuraj.thapa@gmail.com" -d '{"action":"reset-admin","email":"none@example.test"}'
```
