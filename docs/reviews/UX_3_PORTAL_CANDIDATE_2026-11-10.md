# Portal candidate workflow: UX review (DMAIC)

Reviewed on 10 November 2026 in the running local site and in the code. I registered a fictional candidate, verified, signed in, uploaded and replaced a CV, corrected details, changed consents, hid an employer, exported, joined Fast Track, sat a full test, reset the password and deleted the account. Both review accounts were deleted through the site afterwards. One step used a staff sign-in to confirm the Fast Track payment for the review account.

Not walked on screen: a live `/test` invitation and a live `/commit` link (only invalid links were opened); those two are described from the code.

## 1. Define

- **Who:** a job seeker who wants Jobboard300 to hold their CV and contact them about roles.
- **Done for the candidate:** CV on file, details right, they control who sees it, and they hear what happens next.
- **Done for Jobboard300:** a verified, contactable person with a readable CV and a recorded consent for each purpose.

## 2. Measure: the path as it is today

| Step | Screen | What the person does | Fields |
|---|---|---|---|
| A | Create an account | Types details, presses "Create account" | 5 typed, all required (full name, current city, email, mobile, password of 12+ characters), plus 2 required ticks (18 or older; terms and privacy) |
| B | Email | Opens the link | none |
| C | Verify your email | Presses "Verify my email", then "Sign in" | none (2 clicks) |
| D | Sign in | Types email and password again | 2 required |
| E | My CV and privacy | Scrolls past Inbox and the Fast Track offer to "Upload your CV" (about 1,000 pixels down) | 1 file, 1 required tick, 3 optional ticks (sharing arrives already ticked) |
| F | Details read from your CV | Corrects and saves | 6 optional fields, one "remove" tick per skill (15 on the test CV, up to 40), 1 "add skills" field |
| G | Sharing / Hide / Your data | Stop or allow sharing (1 click, no confirmation); hide an employer (1 field, 1 click); download (1 click); delete (1 click, then type DELETE in a browser pop-up) | 1 |
| H | Fast Track | "Join Fast Track" (1 click), pay ₹499 outside the site quoting a reference, wait for staff to confirm | none |
| I | Test | "Take the test", "Start the test", then 20 questions in 25 minutes | 39 clicks measured |
| J | Forgot / reset | Email, link, new password twice, then sign in again | 1 + 2 + 2 |
| K | `/test` and `/commit` links | Test: Start plus 20 questions. Commitment: 1 tick, 1 button. No account needed | 1 tick |

**Totals from nothing to "CV on file":** 4 screens, 7 typed fields, 1 file, 3 required ticks, 3 optional ticks, about 7 clicks, one wait for an email. The full page is 3,166 pixels tall on a laptop and 5,222 on a phone, with 38 controls.

## 3. Analyse: defects and waste, most costly first

Items marked "known" are already in the audit report and are listed only where I build on them.

### Group A. Consent is changed without the person meaning to (every CV replacement; legal exposure)

1. **Replacing a CV silently turns employer sharing back on.** I pressed "Stop sharing now", then replaced the CV without touching the ticks. Sharing went back to "On" and a new "granted" row was written to the consent record.
   - Root cause: the sharing box is pre-ticked every time, whatever the person's current choice.
   - Affected: every candidate who has stopped sharing; Jobboard300, because this consent is not a free choice.
2. **The WhatsApp choice is wiped by any upload where the box is left empty.** I ticked WhatsApp on the first upload; the next upload cleared it.
   - Root cause: the upload form is treated as the only source of truth and always starts empty.
   - It will also wipe a WhatsApp consent given on the new public form when that person later uploads in the portal.
   - Affected: every candidate who replaces a CV; the owner's decision (2) depends on this consent being reliable.
3. **A failed upload still changes consents and uses up an upload.** A file that could not be read returned "Upload a PDF or DOCX file", yet it recorded a processing consent, cleared WhatsApp and counted as one of three uploads.
   - Root cause: the count and the consents are recorded before the file is checked.
   - The message says "3 CV versions a month" but the same limit also applies per day.
4. **WhatsApp consent has no record and no switch.** It is a single date on the candidate record, not a row in the consent record. It is missing from "Download my data", and the screen never shows which number it applies to or whether it is on.
5. **"Stop sharing now" closes every open application and cancels interviews, with one click and no warning.** The message afterwards mentions neither. Known finding F12.5 says turning sharing back on does not restore them.

### Group B. The person is not told what happened or what to do next (every candidate)

6. **Straight after a successful upload the Inbox still says "No messages yet. Upload your CV to get started."** The "CV received" message appears only after a reload. Root cause: the inbox loads once when the page opens.
7. **Messages appear where the person is not looking.** After "Save corrections" the confirmation was 1,477 pixels above the visible screen. The same single message line at the top serves every button on the page.
8. **Out-of-range values are dropped while the screen says "Profile updated."** I entered an expected salary of 0.1 LPA; it was ignored (the minimum is 0.3) with no warning.
9. **Deleting the account ends on a blank sign-in page.** There is no "your account has been deleted" on screen or by email. With known U13.1, success and failure look identical.
10. **A portal upload gets an inbox message only; no email.** The website form now records an email acknowledgement, the portal does not, so the two doors behave differently (builds on known U9.9).
11. **"Write to Jobboard300" gives no address or link** under "Your data".

### Group C. Corrections are lost or recorded wrongly (every save, every replacement)

12. **Replacing the CV throws away every correction.** My added skill disappeared after replacement. Root cause: corrections are stored against the CV file, not the person. Nothing warns the candidate.
13. **Pressing "Save corrections" with nothing changed records "not willing to relocate".** The CV said nothing; the drop-down showed "No"; saving stored "No" as the candidate's own statement, and employers then see "no" instead of "not stated". Root cause: the drop-down has no "not stated" choice.
14. **"Correct anything that was read wrongly" covers only part of what is shown.** Experience, education, name, email and mobile are displayed or held but cannot be corrected. The account's own email and mobile appear nowhere after sign-up.
15. **Tick boxes and radio buttons float away from their text.** On consent lines, skills and test answers the box sits centred on its own line above the words (see `shots/05-candidate-empty.png` and `shots/10-test-question.png`). Root cause: a general label style overrides the row layout. On a consent form this is a real risk of ticking the wrong box.

### Group D. Order and length of the page (every candidate)

16. **A new candidate sees an empty inbox and a paid offer before the upload.** "Upload your CV" is the third block.
17. **Everything is one long page with no sections or status summary.** A candidate with 18 inbox messages has the CV and privacy controls pushed far down. There is no "where is my application" view, only a list of messages.
18. **No way out and no identity.** The top bar has "Sign out" only: no link to jobs, no name or email shown, no change of password or mobile while signed in.
19. **"Sign in" on the public site shows the sign-in form again to someone already signed in.**

### Group E. Sign-up dead ends (a share of sign-ups; each one is a lost candidate)

20. **No "send the link again".** An unverified person signing in is told "Check your inbox for the link" and nothing else. "Forgot password" does activate a never-verified account (I confirmed it), but nothing tells them.
21. **A used or expired verification link says "invalid or has expired"** with the "Verify my email" button still showing and no next step. A second click on an already-used link looks like a failure although the account is fine.
22. **After verifying, the person types email and password again** (2 fields, 2 clicks) seconds after typing them.
23. **Current city is required at sign-up and then read again from the CV.**

### Group F. Fast Track and tests (buyers and invited candidates)

24. **The timed test runs in the middle of the full page**, below the inbox, with "Replace your CV", "Stop sharing now" and "Delete my account" still on screen while the clock runs.
25. **"Take the test" stays on offer when it cannot be taken.** After finishing, the button remains; the 30-day wait is revealed only after pressing "Start the test". While a test is in progress the same test shows both "Continue" and "Take the test".
26. **The Fast Track offer promises four things; the screen shows three.** I saw tests, level and topics to prepare. I found no "guidance for future interviews" anywhere on screen.
27. **The paid promise "counts when recruiters shortlist" is not yet true** (known F11.12: recruiters do not see the result).
28. **No expected time for payment confirmation and no way to cancel an order.**
29. Known and still present: the result screen called the server 154 times in 5 seconds (U12.4).
30. **An invalid `/test` link says only "This test link is not valid."** The commitment page at least says to ask the recruiter.

### Group G. Data rights (few people, legal weight)

31. **"Download my data" is incomplete and hard to read.** It is a code-format file holding profile, consents, "applications" (a list no screen fills any more) and who received the CV. It leaves out account email and mobile, inbox messages, tests, the Fast Track order, the hidden-employer list and the WhatsApp choice.
32. Known and still present: no "Your data" before a CV is uploaded (U5.3); wrong-word delete (U13.1); stale "anonymous summary / unlocks" wording (R12); no off-switch for service offers (R17); password forms without a safe method (Q.forms.noscript).

### Pareto ranking

| Rank | Group | How often | Cost when it happens |
|---|---|---|---|
| 1 | A. Consent changed unintentionally (1–5) | Every CV replacement | Legal; trust; wrongly shared CV |
| 2 | B. No feedback or next step (6–11) | Every session | Doubt, repeat uploads, support calls |
| 3 | C. Corrections lost or wrong (12–15) | Every save or replacement | Wrong matches; recruiter re-asks |
| 4 | E. Sign-up dead ends (20–23) | A share of sign-ups | Candidate lost entirely |
| 5 | D. Page order and length (16–19) | Every session | Slower, primary action buried |
| 6 | F. Tests (24–30) | Paying or invited candidates | Paid product credibility |
| 7 | G. Data rights (31–32) | Rare | Legal |

Groups A to C cause most of the harm and are all small changes.

## 4. Field by field

| Field | Verdict | Stored and read | Note |
|---|---|---|---|
| Full name | Needed now | Candidate record; guides the CV reader; shown to recruiters | Keep |
| Current city (sign-up) | Can be read from the CV; make optional | Candidate record; passed to the CV reader as a hint; overwritten by corrections | The inbox already asks for it when the CV lacks it |
| Email | Needed now | Account and candidate record; sign-in, verification, joining website applications | Keep |
| Mobile | Needed now | Account and candidate record; recruiters call it; WhatsApp | Keep; show it and let it be changed |
| Password | Needed now | Account | Keep |
| 18 or older; terms | Needed now (law) | Checked at sign-up | Keep |
| CV file | Needed now | File store and profile | Keep |
| Processing consent | Needed now (law) | Consent record | Keep, including on replacement |
| Sharing consent | Optional; must mirror the current choice | Consent record; gates submission to clients | Never pre-tick |
| Service offers | Optional | Consent record | Keep; add the off-switch |
| WhatsApp | Optional | Date on the candidate record only | Move to its own switch with a record |
| Current city, expected CTC, notice period (corrections) | Read from the CV; ask only if missing | Profile; the inbox message says roles filtering on these cannot match without them | Keep |
| Preferred cities, current CTC, relocation | Ask later | Profile and candidate record; relocation shown to employers | Keep; add "not stated" |
| Skills add/remove | Ask later | Profile | Keep |

Nothing here should be dropped outright. One field moves from required to optional.

## 5. Improve and control: proposals

| # | Smallest change | Gain | Risk | Control |
|---|---|---|---|---|
| P1 | On the upload form, show sharing, offers and WhatsApp as they stand now; never pre-tick; leaving one alone changes nothing (fixes 1, 2) | Removes 3 decisions on every replacement; ends unintended consent | First-time sharing take-up may fall once the box is not pre-ticked | New check in `scripts/audit/functional.mjs`: stop sharing, replace CV with defaults, latest `share_with_companies` row is still "withdrawn" and `whatsapp_consent_at` unchanged |
| P2 | Check the file first; record consents and count the upload only when the CV is stored (fixes 3). Correct the limit wording | No lost uploads on a bad file | None to data; the abuse limit still applies to stored CVs | New check: unreadable file leaves the `rate_limits` hits and `candidate_consents` count unchanged |
| P3 | Give WhatsApp its own on/off line under "Sharing with employers", showing the number, and write grant and withdraw rows to the consent record (fixes 4) | 1 tick removed from upload; a provable consent | Queued messages read `whatsapp_consent_at`; keep that column filled from the same action | Existing F5.15b plus a new check that the toggle writes a consent row and appears in the export |
| P4 | Confirm before "Stop sharing now", stating that open applications close and interviews are cancelled, and say so afterwards (fixes 5) | Prevents an irreversible mis-click | One extra click on a rare action; withdrawal stays as easy as granting | UAT step: the confirmation text names applications; pipeline rows close only after confirming |
| P5 | Reload the inbox after an upload and show each result beside the button pressed (fixes 6, 7) | Removes a reload and a scroll after every action | None | UAT step U5.4 extended: "CV received" visible without reload; the confirmation is inside the viewport |
| P6 | Refuse out-of-range values with the allowed range (fixes 8) | Removes silent loss | None | New check: 0.1 LPA returns an error and `cv_profiles` gains no version |
| P7 | Carry corrections forward to the new CV, or warn before replacement and list what will be re-asked (fixes 12) | Saves re-entering up to 6 fields and skills on every replacement | Carried skills must stay marked as self-reported so they earn no extra credit | New check: after replacement, `selfReported` and corrected values are still on the primary profile |
| P8 | Add "Not stated" to relocation and save only fields the person changed (fixes 13) | Stops false "No" | Matching already treats "not stated" as not willing; no change in results | New check: save with no change returns "Nothing changed" and adds no profile version |
| P9 | Fix the label style so each box sits beside its text (fixes 15) | Fewer mis-ticks on consents and test answers | Styling shared with staff screens; check those too | Add to `scripts/audit/quality.mjs`: each consent box is within a few pixels of its label's first line |
| P10 | Order the page: status line, then Upload (or CV summary), Inbox, Details, Privacy, Fast Track last; open a test as its own view (fixes 16, 17, 24) | Upload moves from third block to first; test screen drops about 30 unrelated controls | Fast Track sales visibility falls for new candidates; keep a one-line link | UAT: first heading for a new candidate is "Upload your CV"; no "Delete my account" visible during a test |
| P11 | Sign-in: on "verify first", offer "Send the link again". Verify page: on a used link say "already verified, sign in" (fixes 20, 21) | Recovers stuck sign-ups | Must not reveal whether an email has an account; reply the same either way | `tests/fixes.test.mjs` "does not reveal which emails have accounts" extended to the resend |
| P12 | Make current city optional at sign-up (fixes 23) | 1 required field fewer (5 to 4) | A CV without a city leaves the candidate unmatched for city-filtered roles until they add it; the "a few details are missing" message already covers this | Mirror existing F5.15a for the portal: sign-up without city, city read from the CV |
| P13 | After a successful delete, show a confirmation page; send one last email (fixes 9, with U13.1) | Certainty on an irreversible act | The email must be sent before the address is erased | `tests/erasure.test.mjs` still passes; UAT checks the confirmation text |
| P14 | Hide "Take the test" during the 30-day wait and show the date; show only "Continue" for a test in progress (fixes 25) | Removes 2 wasted clicks and a refusal | None | UAT: after completion no "Take the test" for that test |
| P15 | Either add the interview guidance or remove it from the offer; hold "counts when recruiters shortlist" until F11.12 is fixed (fixes 26, 27) | Paid offer matches what is delivered | Owner decision | Quality check for the phrase against the screen |
| P16 | Add to the export: account email and mobile, inbox, tests, order, hidden employers, WhatsApp; offer a readable page as well as the file; show "Your data" before upload (fixes 31, U5.3) | Complete access right | Must stay limited to the person's own rows | Existing F5.6 (one export contains nothing of another candidate) plus a check for each new section |
| P17 | Top bar: show the signed-in email, link to jobs, change password and mobile; send a signed-in visitor from "Sign in" to their page (fixes 14 in part, 18, 19) | Ends a dead end | Changing the mobile must update both the account and the candidate record and the duplicate check | New check: both phone columns and `dedupe_phone_hash` match after a change |
| P18 | Give a contact address under "Your data" and a next step on an invalid test link (fixes 11, 30) | Removes two dead ends | None | Quality check for the text |
| P19 | Send the portal "CV received" by email as the website form now does (fixes 10; part of U9.9) | One behaviour for both doors, as decision (2) requires | Needs the mail key set | Reuse F5.15b for the portal upload |

Who pays: none of these moves work to a recruiter. P7 and P12 reduce what recruiters must re-ask.

## 6. The owner's decisions, checked against this workflow

- **Decision 1 (short public form):** safe for the portal, which already reads the CV. P12 applies the same idea to sign-up.
- **Decision 2 (WhatsApp only with consent):** at risk until P1 and P3 are done. A consent given on the public form is wiped by the person's first portal upload if the box is left empty (finding 2).
- **Decision 4 (fee and 60-day replacement not shown to candidates):** I found neither on any candidate screen. The commitment's "stay at least 60 days" is the candidate's own promise, not the employer guarantee. It should stay, but known R10 notes it is fixed at 60 for every client.
- **Decision 5 (header and footer):** the public header now links "Sign in" to the candidate and client sign-in. See finding 19.

## 7. What to leave alone, and why

- **The three itemised consents and the required processing tick on every upload.** Each purpose is recorded separately with the wording version; this is the legal backbone.
- **The 18-or-older and terms ticks.**
- **The separate "Verify my email" button.** Email scanners open links automatically; the button stops them using up the link.
- **Signing in again after a password reset.** Every session is ended on reset, on purpose.
- **Identical answers whether or not an email has an account** at sign-up, sign-in and reset.
- **Typing DELETE to delete.** Keep the friction; only the pop-up and the ending need work.
- **"Hide from this employer" never revealing who is a client.**
- **Test rules:** one question at a time, no going back, the clock kept by the server, level shown but never the right answers.
- **The 12-character password minimum and the upload limit as an abuse guard** (only when it counts, per P2).
- **Deletion itself.** It removed name, email, phone, messages and the order, kept the 7 consent rows as the law requires, and sign-in then failed.

## Where

- Candidate page: `app/candidate/candidate-app.tsx`; test screen: `components/test-runner.tsx`; one-time link pages: `components/public-link-page.tsx`, `app/test/page.tsx`, `app/commit/page.tsx`
- Sign-up, verify, sign-in, forgot, reset: `app/portal/forms.tsx`, `app/api/portal/auth/[action]/route.ts`, `lib/portal/accounts.ts`
- Upload, consents, corrections, export, delete: `app/api/portal/candidate/[action]/route.ts`, `lib/portal/consent.ts`, `lib/portal/candidate.ts`, `lib/portal/profile.ts`, `lib/portal/ingest.ts`
- WhatsApp consent and inbox: `lib/portal/notify.ts`; upload limit: `lib/portal/access.ts`; tests and Fast Track: `lib/portal/adaptive.ts`
- Tick box layout: `app/platform/platform.css` (line 8) overriding `app/portal/portal.css` (lines 13 and 33)
- Checks to extend: `scripts/audit/functional.mjs` (F5.x), `scripts/audit/uat.mjs` (U5.x), `scripts/audit/quality.mjs`, `tests/fixes.test.mjs`, `tests/erasure.test.mjs`
- Screenshots from this review: `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/shots/`
