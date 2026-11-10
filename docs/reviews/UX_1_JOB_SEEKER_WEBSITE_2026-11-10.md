# Job seeker on the public website: UX review (DMAIC)

Reviewed 10 November 2026 in the running local site and in the code. While I was reviewing, the other engineer replaced the long form with the short one, so this report covers both: the form as it was at the start ("before") and the short form now on screen ("now").

Three things to know before reading:

- **Test records.** I sent two test submissions, "Review Tester mway9nkc" (applied to Junior Accountant) and "General Tester mway9nkc" (Upload your CV). Both are in the local test database and can be deleted from the owner console.
- **Outage during the change-over.** For several minutes every submission failed with "We couldn't submit your details", because the new code was running before the database had its new columns (see finding 3).
- **Not tested.** A real email or WhatsApp delivery (neither is set up locally), and the long form's success message, which I did not see on screen: it was replaced before my first successful submission, so I read it from the code.

## 1. Define

- **Who:** a job seeker, usually on a phone, who either wants one advertised role or wants to be on file for future roles.
- **Done for them:** CV handed over in about a minute, proof it arrived, and a clear idea of what happens next and by which channel.
- **Done for Jobboard300:** one person record with a readable CV, a way to reach them, and a provable record of exactly what they agreed to.

## 2. Measure: the path as it is

### 2.1 Screens and clicks

| Step | Screen | What the person does | Clicks |
|---|---|---|---|
| 1 | Home page, "Current jobs" | Optional: type a role or skill, choose a location (All, Asansol, Durgapur, Kolkata), press Search or Enter. Both work. | 0 to 2 |
| 2 | Job list | Press "View role". | 1 |
| 3 | Job page | Read the role, fill the form beside it (below the title on a phone), press "Apply for this role". | 1, plus fields |
| 4 | Same page | Confirmation replaces the form. | 0 |

The other route is "Upload your CV", "I'm looking for work" or "Register your CV" (one click from the home page or the job-seekers page), which opens a pop-up with the same fields, then "Upload my CV" and "Close".

A search with no results shows "No matching roles yet" with a "Register your CV" button, which is a good recovery.

### 2.2 Fields, before and now

| Field | Before: job form | Before: Upload your CV | Now: job form | Now: Upload your CV |
|---|---|---|---|---|
| Full name | required | required | required | required |
| Email | required | required | required | required |
| Phone | required | required | required | required |
| Preferred location | required | required | optional | optional |
| Desired role | optional | required | removed | removed |
| Skills | optional | optional | removed | removed |
| Availability | optional | optional | removed | removed |
| Education | optional | optional | removed | removed |
| Experience summary | required | required | removed | removed |
| CV file | required | required | required | required |
| Tick: use my details | required | required | merged into one tick | merged into one tick |
| Tick: I am 18 or older | required | required | merged | merged |
| Tick: terms for job seekers | required | required | merged | merged |
| Tick: share my CV with the employer | optional | optional | optional | optional |
| Tick: contact me about other roles | optional | required | optional | hidden, always "yes" |
| Tick: WhatsApp updates | not there | not there | optional | optional |
| **Things to fill or tick** | **15 (9 required)** | **15 (11 required)** | **9 (5 required)** | **8 (5 required)** |
| Form height on a desktop | 1,435 px | (scrolling pop-up) | 981 px | fits the pop-up on a desktop |

On a 360 px phone the pop-up is still 1,286 px of content in a 700 px window, so about two screens of scrolling.

### 2.3 Messages the person receives

| Moment | Before | Now |
|---|---|---|
| On screen | From the code: "Your details have been saved. Reference: JP-… A recruiter will review them and contact you if there is a relevant next step. Keep this reference for follow-up." The form was cleared and stayed on screen. | Seen: "Thank you. Your CV is with us. Your reference is JP-B3FE5C0D4F31. Please keep it. A recruiter will review your CV and contact you when a role fits." The form is replaced by this. |
| Email | None | Written and recorded, but not sent locally: the database row says "skipped: email is not configured". |
| WhatsApp | None | With the tick, recorded as "skipped: no WhatsApp number configured". Without the tick, nothing is queued. |
| Same email, same role, within 24 hours | Refused with a pointer to the privacy request form | Same |
| Wrong file type | "Upload a valid PDF or DOCX file." Typed fields are kept. | Same |

### 2.4 Where each field goes, and who reads it

I traced every reader of the application record.

| Field | Stored in | Read by | Verdict |
|---|---|---|---|
| Name, email, phone | Application, then the person record | Owner console, Recruiting tool ("show phone and email"), duplicate check, erasure, confirmation | **Needed now** |
| Preferred location | Application `location`; copied to the person record as their **current** city; also overrides the city read from the CV | Owner card, owner search, recruiter card ("city"), client's candidate list, matching, the CV cover text | **Needed, but optional and stored correctly** (finding 5) |
| Experience summary | Application `experience` | Owner card and the owner's "Correct profile" form only. Not matching, not the Recruiting tool. | **Read from the CV** |
| Skills | Application `skills` | Owner card and owner search only. Matching uses the 15 skills read from the CV, never this box. | **Read from the CV** |
| Education | Application `education` | Owner card and correction form only | **Read from the CV** |
| Desired role | Application `desired_role` | Owner card title for general registrations, owner search | **Not needed on the form.** The CV gives the role family (the test CV came out as "accounts-finance"). |
| Availability | Application `availability` | Owner card only. Matching's notice-period rule reads the CV text, never this box. | **Ask later**, on the recruiter's first call |
| Message | Application `message` | Owner card only. No form ever had an input for it (already reported as R19). | **Not needed** |
| CV file | File store, two copies (application and person record) | Owner download, CV reading, matching, client download | **Needed now** |
| Ticks | Application columns, and the consent ledger for "other roles" and "share" | Whether a recruiter can submit the person, matching, privacy requests | **Needed now, itemised** |

So the cut-down form loses nothing that matching or the Recruiting tool uses. The only screen that read the dropped fields is the owner console's "Candidate pipeline" card (finding 4).

## 3. Analyse: defects and waste, most costly first

### Pareto ranking

| Rank | Finding | Who is affected | How often | Cost |
|---|---|---|---|---|
| 1 | F1 No message actually leaves the building | Every applicant | Every submission | Person hears nothing; calls or re-applies |
| 2 | F2 Consent record does not match what was shown | Every applicant, and Jobboard300 legally | Every submission | Consent that cannot be proven |
| 3 | F3 Form was down during the change-over | Every applicant in that window | Each release that changes the database | Lost applications |
| 4 | F4 Owner card is now empty | Owner | Every new application | One CV download per person to learn anything |
| 5 | F5 "Preferred location" recorded as where the person lives | Recruiter, client, applicant | Whenever the two differ | Wrong city shown to a client |
| 6 | F6 City missing on the cards when the box is left empty | Recruiter, owner | Whenever the box is empty | "City not stated" although the CV says it |
| 7 | F7 Messages that point to screens the person cannot open | Website applicants | Every submission | Confusion once those messages are emailed |
| 8 | F8 Phone: form before the role | Phone visitors | Every job page visit | Person is asked to apply before reading |
| 9 | F9 to F13 Smaller items | Various | Occasional | Minor |

The first three account for most of the risk. Applicants still not reaching the recruiter until "Run scoring now" is pressed is already reported as F5.20 and is not repeated here; both my test applicants are still sitting in that queue.

### Findings

**F1. The promised email and WhatsApp are written but not sent.**
The screen and the form footer say "We confirm by email". Locally the email was recorded as "skipped: email is not configured" and the WhatsApp as "skipped: no WhatsApp number configured". The screen handles this honestly: when the email is not sent, it shows the reference instead of claiming an email.
- Root cause: mail keys and a WhatsApp provider are not set up. This builds on the audit's U9.9.
- Affected: every applicant.
- Second point: when the email is sent, the screen says "We have emailed the details to …" and drops the reference. The address is never verified, so a person who mistyped it has no reference and no email.

**F2. The consent record does not match what the person saw.**
- (a) "Upload your CV" now sends a hidden "contact me about other roles = yes". The ledger then records the old sentence "Contact me about other suitable roles later." with its fingerprint. The person never saw that sentence; they saw one combined tick. I confirmed the ledger row for my test registration.
- (b) One tick now covers four things: being 18, use of the data, the terms, and (on the general form) future contact. Data-protection consent is meant to be itemised and separate from accepting terms.
- (c) The WhatsApp tick is kept only as a yes/no and a time. It is not in the consent ledger, so there is no record of the wording agreed to.
- (d) "Your choices: optional; you can change them later" is not true on any screen for a website applicant. The only route is the privacy request form.
- Root cause: the form wording changed and the ledger wording did not; the ledger has no "WhatsApp" purpose.
- Affected: every applicant, and Jobboard300 if a consent is ever challenged.

**F3. The form failed for every visitor while the change was going in.**
My submissions returned "We couldn't submit your details. Please try again in a moment." until the database gained its new columns. The uploaded CV was discarded each time (correct behaviour).
- Root cause: new code ran before the database change.
- Affected: on the live site, every applicant in that window.

**F4. The owner's "Candidate pipeline" card now tells the owner nothing about the person.**
For my test applicant the card reads "Junior Accountant · · 11/10/2026", then email, phone, reference and consents. There is no experience, skills or education line, and there is an empty gap where the city was. The search box still says "Search by name, email, location, role or skill", but role and skill search only looks at the removed boxes, so it finds no new applicant.
- Root cause: the card reads the typed boxes, not the profile read from the CV, which exists (4.4 years, 15 skills, B.Com, city).
- Who pays: the owner, who must download each CV. This is work moved, not removed.

**F5. "Preferred work location" is stored as where the person lives.**
My test person's CV says Durgapur. I typed "Bengaluru" as preferred. The record and the CV profile now both say current city "Bengaluru"; the CV's own city is overridden.
- Effect: the recruiter card and the client's list show Bengaluru, and the match explanation can say "Based in Bengaluru".
- Root cause: the form's one location box feeds the "current city" slot. This was already so with the long form.
- Affected: recruiter, client, and the applicant who is misdescribed.

**F6. If the location box is left empty, the cards show no city even though the CV has one.**
My job applicant left it blank. The CV profile says Durgapur and matching will use it, but the person record's city is empty, so the Recruiting tool shows "city not stated" and the owner card shows a gap.
- Root cause: the city read from the CV is not copied to the person record for website applicants.
- Affected: recruiter and owner.

**F7. Two messages point to screens a website applicant cannot open.**
- The inbox note written for my applicants says "We will message you here when a role fits". "Here" is the portal inbox, and they have no account.
- When a CV lacks notice period, expected salary or city, the note says "Please add your … under 'Details read from your CV'", a portal screen (read in the code).
- Today nobody sees these. Once U9.9 is fixed and inbox messages are emailed, every website applicant will get them, along with the new confirmation, so two emails on the same minute.
- Root cause: messages were written for portal account holders.

**F8. On a phone the application form comes before the job.**
At 360 px wide the page shows the title bar, then the whole form (about 1,000 px), then "Junior Accountant", "About the role" and "What we're looking for". There is no "Apply" jump link. The combined tick box also sits alone on a line above its sentence.
- Root cause: on narrow screens the side column is placed first.
- Affected: most job seekers.

**F9. The phone box accepts anything with 7 digits, and the WhatsApp tick relies on it.**
The duplicate check only works on 10-digit numbers. A number without a country code cannot be used for WhatsApp.
- Affected: applicants who tick WhatsApp and then hear nothing.

**F10. The WhatsApp text says "Reply STOP to stop WhatsApp updates", and nothing handles a reply.**
No provider is connected and no code reads incoming messages.
- Root cause: wording written ahead of the feature.

**F11. Other pages still describe the old form.**
- The job-seekers page, step 01: "Add your skills, experience, expected salary and notice period". This builds on R19 and is now further from the truth.
- Owner console, Job portal tab: "only if they ticked 'Contact me about other suitable roles'". The general form no longer has that tick.

**F12. Closing the pop-up throws away what was typed.**
I typed a name, pressed Escape, reopened, and the box was empty. A press on the dark area outside the pop-up also closes it. This costs less now with 5 fields than it did with 11.

**F13. A person who uploads the wrong CV has a dead end for 24 hours.**
The refusal sends them to the privacy request form and an identity check. This is a deliberate safeguard, since email is not verified. See section 5.

## 4. Improve: proposals, each with its control

**P1. Keep the short form (the owner's decisions 1 and 2). It is safe.**
- Gain: job form 15 to 9 things to fill or tick (required 9 to 5); general form 15 to 8 (required 11 to 5); about 450 px less form on a desktop.
- Risk: none to matching or the Recruiting tool (traced in 2.4). The risks are F4 to F6 and are covered by P4 to P6.
- Control: the database columns stay and receive empty text, so nothing is dropped. The functional audit's F5.15 and the new F5.15a prove the short form is accepted and stored. Keep the server accepting the old three ticks as well as the new one, as it does now, so an old open page still works.

**P2. Regroup the ticks so each consent stays itemised (fixes F2).**

Proposed layout, job form:

- Required 1 (a declaration, not a consent): "I am 18 or older and I accept the terms for job seekers."
- Required 2 (the data consent): "Jobboard300 may store my CV and details and use them to consider me for this role. Privacy notice."
- Optional, under "Your choices (optional)":
  - "Share my CV with the employer for this role, after a recruiter has checked the fit."
  - "Keep my CV and contact me about other suitable roles."
  - "Send me updates on WhatsApp at this number, as well as by email."

On "Upload your CV", required 2 becomes "Jobboard300 may store my CV and details, match them to roles, and contact me about roles that fit. Privacy notice." This is the purpose of registering, so no hidden field is needed.

Also replace "you can change them later" with "To change these later, use the privacy request form".

- Gain: against the old form, 3 required ticks become 2 on the job form and 4 become 2 on the general form. Against the form now on screen it is one extra tick, and that tick is what makes the consent provable.
- Risk: the wording of record must change with the screen.
- Control:
  - Update the website consent wording and give it a new version, so the ledger fingerprint matches the screen.
  - Add a "whatsapp" purpose to the consent ledger, or at least store the wording version beside the WhatsApp time.
  - Add an audit check that the ledger sentence for a new website registration equals the sentence on the form.
  - Have the wording read by the lawyer together with the privacy notice rewrite already listed in the audit (Q.stale.demo, R12).

**P3. Confirmation wording by channel (decision 2).**

- **On screen**, always all three parts: "Thank you. Your CV is with us. Your reference is JP-…. We have sent the details to name@example.com; check your spam folder if you do not see it. A recruiter reviews every CV and contacts you when a role fits." If the email could not be sent, leave out the "we have sent" sentence, as now.
- **Email**: the drafted text is good. Three changes:
  - Say plainly "We contact you when a role fits; we cannot reply to every application individually", if that is true.
  - For a job application without the share tick, say "We will ask you before your CV goes to the employer".
  - Name the choices they made (share: yes/no; other roles: yes/no; WhatsApp: yes/no), so the email is their receipt.
- **WhatsApp** (only with the tick): "Jobboard300: we have your application for [role]. Reference JP-…. A recruiter will contact you when a role fits. To stop WhatsApp updates, use the request form at [link]." Use "Reply STOP" only once a provider is connected and replies are handled (F10).

- Gain: no person is left without a reference; no promise the system cannot keep.
- Risk: the UAT auditor's steps U6.2 and U11.3 wait for the text "Reference: JP-" in the old message area. They will fail until updated to the new confirmation.
- Control: update those two steps. Add a functional check that each application creates one email row, and one WhatsApp row only when the tick was given; the engineer has already done the equivalent for enquiries in F2.6b. On the live site, send one real test and confirm the row says "sent".

**P4. Show the CV-read summary on the owner's card (fixes F4).**
On each card, show years of experience, last job title, top five skills, highest qualification and city, from the profile already stored for that person. Point the search at the same data. Change the label to match.
- Gain: no CV download just to see who the person is. This returns the information the long form gave, without the applicant typing it.
- Risk: none to data; display only. Older records keep their typed text, which should still show when present.
- Control: add to the functional audit's F5.19 that the owner's record for a short-form applicant carries a non-empty skills summary.

**P5. Store "preferred work location" as a preferred city, not the current city (fixes F5).**
Put the typed value in the person's preferred cities, and let the CV supply the current city. If the CV has no city, use the typed one as a fallback.
- Gain: no misdescribed candidates; matching still finds them for the city they want, because matching looks at current and preferred cities.
- Risk: the Recruiting tool card and the client list show one city. Check they show the CV's city afterwards.
- Control: a test in the merge-plan test file: CV city Durgapur plus typed Bengaluru gives current city Durgapur and preferred cities including Bengaluru. Plus the existing location-matching checks.

**P6. Copy the city read from the CV onto the person record when the box is empty (fixes F6).**
- Gain: "city not stated" disappears for most website applicants.
- Risk: must not overwrite a city the owner corrected by hand.
- Control: F5.15a already states "the city is read from the CV". Extend it to check the person record's city, not only the profile.

**P7. Apply the database change before the new code, every time (fixes F3).**
- Gain: no window in which the form rejects everyone.
- Control: after each release, send one test application on the live site and delete it. Add this to the release notes as a step.

**P8. Give website applicants their own versions of the two inbox messages (fixes F7).**
For a person without an account: "We read your CV. A recruiter will ask you for your notice period and expected salary when they call." Send it only as part of the single confirmation email, not as a second email.
- Gain: one email per application instead of two; no dead-end instruction.
- Control: when U9.9 is fixed, add a check that a website applicant receives exactly one email for one application.

**P9. On a phone, show the role first and add an "Apply" button that jumps to the form (fixes F8).**
Also keep the tick box on the same line as its sentence.
- Gain: the person reads the role before being asked for a CV; one tap reaches the form.
- Risk: layout only.
- Control: the quality auditor already opens public pages at 360 px. Add a check that the role title sits above the form on that width.

**P10. Check the phone number properly when WhatsApp is ticked (fixes F9).**
Accept a 10-digit Indian mobile or a number with a country code; otherwise show "Enter your mobile number with country code to get WhatsApp updates".
- Gain: no silent WhatsApp failures.
- Risk: must not block people who do not tick WhatsApp.
- Control: a functional check that a 7-digit number with the WhatsApp tick is refused, and the same number without the tick is accepted.

**P11. Ask notice period and expected salary later, not on the form.**
The recruiter asks on the first call and records it. Some clients' rules filter on these, and a website applicant has no screen to add them.
- Risk: this needs a place for the recruiter or owner to record the answer on a website applicant. The owner's "transcribe" action in the Job portal tab already takes notice days; confirm it covers this before relying on it.
- Control: after recording, the person passes a client rule that requires a stated notice period (the matching checks already cover the rule itself).

**P12. Update the wording that describes the old form (fixes F11).**
- Job-seekers page, step 01: "Upload your CV and choose what we may do with it. It takes about a minute."
- Owner console note: match the new tick wording.
- Control: the quality auditor's outdated-wording list; add these two phrases.

**P13. Close the pop-up only by the close button or Escape, and keep typed text if it is reopened (fixes F12).**
- Gain: no lost typing from a stray tap.
- Risk: keyboard focus handling must stay as it is.
- Control: UAT step U11.3 still passes.

## 5. Control: what to leave alone, and why

1. **The CV stays mandatory, with the file checks** (real PDF or DOCX, 5 MB). Everything else is now read from it. Covered by F5.23 and F5.24.
2. **The 18-or-older statement and the terms acceptance stay required.** They may share one tick (P2) but may not disappear.
3. **"Share my CV" stays optional and unticked.** The Recruiting tool's "can submit" rule reads it; without it the recruiter is told to ask first. It protects the applicant.
4. **The job form's share tick covers that one role only.** The code deliberately does not turn it into general sharing. Keep it.
5. **The 24-hour refusal of a second submission, and "your earlier CV has not been replaced" (F13).** Email is not verified on this form, so letting a second upload replace the first would let a stranger overwrite someone's CV. Covered by F5.21.
6. **The rule that a form sent with a verified account holder's email changes nothing on that account**, and that the WhatsApp tick is not applied to it either. The new code keeps this.
7. **The hidden spam-trap box, the same-site check and the hourly limit.** Invisible to people; they keep junk out.
8. **The database columns for experience, skills, education, desired role, availability and message.** Do not delete them. Older records hold real text there, the owner's correction form still edits them, and deletion would gain nothing.
9. **The application copy of the CV as well as the person-record copy.** The owner's download and the erasure routines each rely on one of them.
10. **The honest fallback on screen** (reference shown when the email was not sent). It never claims a message that was not sent.
11. **Search on the home page.** Enter now works, the empty result offers "Register your CV", and the sample listings refuse applications clearly.

## Where

- Form fields and ticks: `components/candidate-fields.tsx`
- Job page form and the pop-up: `app/jobs/[id]/application-form.tsx`, `components/public-enquiry-dialog.tsx`, `components/form-confirmation.tsx`
- Receiving the form: `app/api/applications/route.ts`
- Confirmation wording (screen, email, WhatsApp): `lib/public-forms.ts`
- Joining the candidate list, consent ledger: `lib/portal/website.ts`, `lib/portal/notice.ts`, `lib/portal/consent.ts`
- City handling (F5, F6): `lib/ats/cv-parser.ts` (the typed location overrides the CV's), `lib/portal/profile.ts`, `lib/portal/candidate.ts` (`createCandidate`, `addCv`)
- Inbox messages for website applicants (F7): `lib/portal/ingest.ts`, `lib/portal/notify.ts`
- Owner card and search (F4): `app/admin/admin-client.tsx`, `app/api/admin/records/route.ts`, `app/api/admin/records/[type]/[id]/route.ts`
- Recruiter and client views that read the city and the share tick: `lib/portal/client.ts` (candidate list for a job), `app/platform/recruiting/recruiting.tsx`
- Database change: `drizzle/0021_enquiry_call_and_whatsapp_consent.sql`, `db/schema.ts`
- Checks to update or extend: `scripts/audit/functional.mjs` (F5.14 to F5.25, F5.15a), `scripts/audit/uat.mjs` (U6.2, U11.3), `tests/merge-plan.test.mjs`, `tests/fixes.test.mjs`
- Stale wording (F11): `app/job-seekers/` page, `app/admin/portal-panel.tsx`
- Screenshots from this review (a folder shared with other reviewers, so files may be overwritten): `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/job-mobile.png`, `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/job-new.png`, `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/job-new-sent.png`, `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/dialog-new-sent.png`
