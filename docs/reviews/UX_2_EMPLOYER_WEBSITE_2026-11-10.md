# Employer on the public website: Six Sigma (DMAIC) review

Reviewed 10 Nov 2026 in the running app and in the code. The enquiry form was being rebuilt during the review, so "today" means the form still on screen, and section 3 also reviews the half-built replacement.

Three things I could not confirm or must disclose:

- **The success screen was not seen live.** Every test enquiry I sent was refused with "We couldn't submit your enquiry" (finding 12). The success message is described from the code and from the earlier audit run.
- **Two findings are from code only.** The duplicate-enquiry finding (8) and the unmarked "role family" rule on the invite form (4) were not exercised in the browser.
- **My tests used up the local hourly limit.** The form allows 8 enquiries an hour per network address. Other testers on this machine may see "Too many requests" for up to an hour. No test enquiry was saved.

---

## 1. Define

**Who:** an owner, HR head or hiring manager at an Indian company, usually on a phone, who wants to know whether Jobboard300 can help and what it costs.

**Done for them:** "I have told them what I need, I know when someone will call, and I have it in writing."

**Done for Jobboard300:** a saved enquiry with a reachable person, consent on record, a call in the diary, and a client account created without retyping.

---

## 2. Measure: the path as it is today

### 2.1 Ways in

| Page | Buttons that open the employer form | Wording |
|---|---|---|
| Home | 7 | "Hire talent" (header, hero, footer), "Talk to a recruiter", "Send a hiring requirement", "Contact Jobboard300", "I'm hiring" |
| /employers | 4 | "Hire talent" (header, footer), "Send a hiring requirement" (top and bottom) |

All 11 buttons open the same pop-up, headed "FOR EMPLOYERS – Tell us about the role." Two home-page links also lead to /employers ("Employers", "Fee, terms and how hiring works").

### 2.2 The pop-up form

| # | Field | Required | Notes |
|---|---|---|---|
| 1 | Your name | Yes | |
| 2 | Company | Yes | |
| 3 | Work email | Yes | Any valid address is accepted, including Gmail |
| 4 | Phone | Yes | Any text is accepted (finding 6) |
| 5 | Position to fill | Yes | Role-level |
| 6 | Hiring location | Yes | Role-level |
| 7 | Number of hires | Yes | Pre-filled with 1; role-level |
| 8 | Role details | Yes | Prompt: "Key skills, experience and expected start date"; role-level |
| 9 | Tick: Jobboard300 may contact me | Yes | |
| 10 | Tick: authorised for the company and agree to the terms for employers | Yes | |
| – | Hidden trap field for robots | – | Not seen by people |

**Counts:** 8 visible fields, all required, 7 to type, 2 ticks, 1 send button. From landing to sent takes 11 actions. Four of the eight fields describe a job, not an enquiry.

**After sending (from code):**
- One long line appears under the button: saved, the reference (HE-…), "a recruiter will review … Recruitment starts after the scope is agreed".
- The form empties and stays open.
- No email or WhatsApp is sent, and no time for a reply is promised.

### 2.3 The owner's side

| Step | Screen | What the owner does |
|---|---|---|
| 1 | Owner console | Signs in. Nothing tells the owner an enquiry arrived. |
| 2 | "Employer enquiries" tab (1 click) | Reads the card: company, position, contact, location, hires, email, phone, reference, details. |
| 3 | Same card | Sets a status (new / contacted / in progress / closed), picks an existing client, or deletes. |
| 4 | "Job portal" tab → "Invite a client" (2 clicks) | Faces a blank form with 39 controls: 11 company and terms fields, 28 matching-rule controls. |
| 5 | Invite form | Types company name, legal name and owner email (3 required, empty). Fee 8.33%, guarantee 60 days and non-solicitation 12 months are pre-filled. Must tick at least one role family. |
| 6 | Result | Gets a one-time sign-in link for the client. |
| 7 | Back to "Employer enquiries" | Reloads the page, picks the new client in the list, changes the status. |

**Counts:** about 8 clicks across 2 tabs and a reload. Four things the enquiry already holds are typed again: company, contact name, email, city.

---

## 3. Analyse: defects and waste, most costly first

### Pareto ranking

| Rank | Finding | How often | Who pays | Cost |
|---|---|---|---|---|
| 1 | No acknowledgement to the employer, no alert to the owner | Every enquiry | Employer, owner | Lost leads |
| 2 | The form asks for a job description | Every enquiry | Employer | Abandoned forms |
| 3 | No call booking and no promised reply time | Every enquiry | Employer, owner | Phone tag, slow first contact |
| 4 | Enquiry details retyped to make a client | Every enquiry that converts | Owner | Time, typing errors |
| 5 | Console has nowhere for call notes, the handler or the age | Every enquiry | Owner, team | Missed follow-ups |
| 6 | Phone number is not checked | Some | Owner, employer | Unreachable lead, failed WhatsApp |
| 7 | Eleven buttons with seven wordings open one "about the role" form | Every visit | Employer, job seekers | Confusion |
| 8 | Duplicate enquiries are easy to send | Some | Owner | Clutter |
| 9–14 | Wording and small form faults | Varies | Varies | Low each |

Findings 1 to 4 account for most of the cost. They are the owner's planned changes, so the plan is aimed at the right place.

### Findings

**1. Nobody is told anything after "Send".**
- *What happens:* the employer sees one line on screen and gets nothing in writing. The owner learns of an enquiry only by opening the console.
- *Extra detail:* the console's tab badge counts all enquiries ever received, not the new ones, so it does not signal anything. The Privacy requests badge counts only open items.
- *Root cause:* the first version saved a record and stopped. The privacy notice says so: "The website currently sends no automatic acknowledgement email or recruiter email notification."
- *Who:* every employer and the owner.
- *Known:* the audit's U9.9 covers the missing emails in general. The missing owner alert and the misleading badge are new.

**2. An enquiry is treated as a job brief.**
- *What happens:* position, location, number of hires and role details are all compulsory before any conversation.
- *Root cause:* the form was designed as "send a requirement". The business process is "enquire, talk, agree, then brief".
- *Trace:* these four fields are stored on the enquiry and shown only on the enquiry card. Creating a client, posting a job and the client workspace never read them.
- *Who:* every employer.

**3. No next step with a time.**
- *What happens:* "A recruiter will review the requirement and follow up" gives no day, no hour and no way to choose one.
- *Root cause:* no meeting data existed in the system.
- *Who:* employer and owner.

**4. Enquiry to client means retyping.**
- *What happens:* see 2.3. The invite form is in another tab, blank, and the link back is a separate step after a reload.
- *New detail (from code):* at least one "permitted role family" must be ticked, but the form does not mark it, so the owner finds out only after pressing the button.
- *Root cause:* enquiries and clients were built a month apart. The server already accepts an enquiry reference when creating a client, but no screen sends it.
- *Known:* U2.2 and U2.4a.

**5. The enquiry card cannot hold the conversation.**
- *What happens:* there is no notes box, no "handled by", no "waiting since", and no status for "call booked". What was said on the call has to live elsewhere and be typed again later.
- *Root cause:* the card was built as a read-only inbox.
- *Who:* owner and any consultant taking the call.

**6. The phone box accepts anything.**
- *What happens:* the server accepted "abc" as a phone number in my test. It was rejected later for a different reason.
- *Root cause:* the only check is "not empty". The candidate correction screen already checks for at least 7 digits, so the rule exists but is not applied here.
- *Why it matters more now:* WhatsApp will be sent to this number.

**7. One form behind many labels.**
- *What happens:* "Contact Jobboard300" and "Talk to a recruiter" open a form headed "Tell us about the role".
- *Known:* R18. Once the form becomes an enquiry the heading must change, or the mismatch remains.

**8. Duplicates are easy (from code).**
- *What happens:* after a successful send the form clears but stays open with the button live. The server does not look for an existing open enquiry from the same email.
- *Root cause:* the pop-up has no "finished" state.

**9. Candidate wording is shown to employers.**
- *What happens:* under the employer form: "To correct a profile or request a CV replacement, use the privacy request form."
- *Also:* the owner's delete prompt for an enquiry says "…and any stored CV". An enquiry has no CV.
- *Root cause:* text shared between the two forms.

**10. No help from the browser.**
- *What happens:* the four contact boxes do not tell the browser what they are, so saved name, company, email and phone are not offered.
- *Who:* every employer, mostly on phones.

**11. The error message does not say what is wrong.**
- *What happens:* "Please complete the required fields and accept the terms for employers" is the only message for every kind of mistake.

**12. The half-built form could not save during the review.**
- *What happens:* every enquiry returned "We couldn't submit your enquiry." The program already expected the new columns for WhatsApp consent, call time and acknowledgement status. The local database did not have them yet.
- *Root cause:* a database change and a program change that must go live in a fixed order.
- *Risk:* if the live site is updated in the wrong order, every enquiry fails with a polite message and nobody is told.

**13. The privacy notice will be out of date the day the new form goes live.**
- *What happens:* it lists "role, location, number of hires" as collected and says no acknowledgement is sent.
- *Also:* the privacy version stamped on each enquiry is a fixed date (2026-10-13) typed into the program.

**14. Home page still shows employer money facts in general areas.**
- *What I saw at the time of review:* "60 days – one free replacement" under the hero, and "Fee of 7.5% to 8.33% on placement / 60-day free replacement" in the strip below it.
- *Note:* this is the owner's decision 4, already in hand. The same facts in the "For employers" panel and on /employers are in the right place.

### Review of the half-built replacement

These points come from the new files I read (they are not yet on screen).

**15. Slot rules.** The draft offers Monday to Saturday, 10:00 to 18:00 India time, 30 minutes, for two weeks. Three problems:
- The note says "from the next working day", but the rule is "4 hours from now". At 10:00 an employer can ask for 14:00 the same day.
- No lunch break and no public holidays (for example Durga Puja or Diwali).
- Only one request per slot for the whole company.

**16. A stranger can block the diary.** A requested slot is taken off the list at once. With 8 enquiries an hour allowed per network address, a nuisance sender could take half a day of slots in an hour.

**17. The meeting has no owner and no "other time".** The record holds a time and a status (requested / confirmed / done / cancelled). It does not hold who takes the call, a note, or a way to offer a different time.

**18. WhatsApp is promised but not connected.**
- The draft email says the consultant will confirm "by email or WhatsApp". The draft WhatsApp text says "Reply STOP to stop WhatsApp updates."
- No WhatsApp service is connected, so messages are only queued and nobody would read a "STOP".
- This would be a promise the business cannot keep yet.

**19. The reference disappears from the screen when the email is "sent".** "Sent" means handed to the mail service, not delivered. An employer who mistyped their email is left with nothing.

**20. "Within one working day" is a new promise.** The draft email makes it. The console has nothing that shows which enquiries are about to break it.

**21. Old role columns must still be filled.** The database insists on a position, a location and details for every enquiry. The new form must store blanks for the first two, and the console card must not then print "Company · " and "Name · · 1 hire(s)".

---

## 4. Improve: proposals

### Field by field

| Field | Verdict | Stored / read today | Proposal |
|---|---|---|---|
| Your name | Needed now | Enquiry; shown on card | Keep. Carry into "owner's name" on the client form. |
| Company | Needed now | Enquiry; card heading | Keep. Carry into "company name". |
| Work email | Needed now | Enquiry; card | Keep. Receives the acknowledgement; carry into "owner's work email". Keep accepting Gmail and similar. |
| Phone | Needed now | Enquiry; card | Keep, with a real check. Label "Phone (with WhatsApp if you use it)". |
| Position to fill | Ask later (on the call) | Enquiry; card only | Remove from the form. Keep the column for old enquiries. |
| Hiring location | Ask later | Enquiry; card only | Remove from the form. Keep the column. |
| Number of hires | Ask later | Enquiry; card only | Remove from the form. Keep the column. |
| Role details | Replace | Enquiry; card only | Becomes "What are you looking for?", one free-text box, stored in the same place. |
| Preferred call time | New, optional | New column | Add. |
| WhatsApp consent tick | New, optional | New column | Add, unticked by default. |
| Contact consent tick | Needed now (law) | Enquiry, with date and version | Keep unchanged. |
| Authority and terms tick | Needed now (law) | Enquiry, with terms version | Keep unchanged. |
| "Read from the CV" | Not applicable | – | No CV in this workflow. |

**Result:** typed fields fall from 7 to 5, required fields from 8 to 5, required ticks stay at 2, and one optional tick and one optional time choice are added. No job description is asked for.

### Proposals

**P1. Make the form an enquiry** (findings 2, 7, 21)
- *Change:* fields as in the table. Heading "Tell us what you need." Prompt in the message box: "For example: two accountants in Durgapur, to join next month." One button label everywhere: "Send an enquiry".
- *Gain:* 3 fields and 3 required answers removed.
- *Risk:* the database refuses a blank position or location; old enquiries look odd on the card.
- *Control:*
  - Columns stay; new enquiries store an empty position and location, and the card hides empty parts.
  - The server keeps accepting, and ignores, the old field names.
  - Checks F2.2 and F2.3 are updated to prove contact details and message are stored as typed.
  - Check U1.2 is updated to fill the new fields.
  - F2.5 (bad email refused) and F2.6 (no terms, refused) are left exactly as they are.

**P2. Optional "pick a time for a call"** (findings 3, 15, 16)
- *Change:* two taps, a day then a time. Clearly optional, with "or we will call you within one working day".
- *Slot rules that suit an Indian recruitment desk:*

| Rule | Recommendation |
|---|---|
| Days | Monday to Friday; Saturday mornings only. Never Sunday. |
| Hours | 10:30–13:00 and 14:30–18:00 India time (Saturday 10:30–13:30). Last start 17:30. |
| Label | Every time shown as "India time (IST)". |
| Length | 30 minutes. |
| Lead time | Earliest slot is the next working day. A request after 18:00 gets nothing before 11:00 next day. Same-day requests fall back to "we will call you". |
| How far ahead | 7 working days, not 14, to reduce no-shows. |
| Closed dates | A short list of holidays the owner can edit. |
| Capacity | One call per slot for now. Raise it when a second consultant takes calls. |
| Per person | One open call request per email address. |

- *Wording:* always "you asked for", never "booked", until the owner confirms.
- *Gain:* removes the email or phone exchange to fix a time.
- *Risk:* two people choose the same time; someone blocks slots; a time in the past or on a Sunday is sent by hand.
- *Control:*
  - The database already has a "one open request per slot" rule in the draft.
  - Add tests: a Sunday, a past time and an off-hours time are refused.
  - Add a test: when the same slot is asked for twice, the second enquiry is still saved, without a time, and the person is told to pick another.
  - Add a test: a second open request from the same email is refused.
  - The draft's comment and rule on lead time must agree.
  - If a "list free times" address is added, it must be added to the list of public addresses in the access tests.

**P3. Acknowledge by email, WhatsApp only with consent** (findings 1, 18, 19)
- *On screen, short:* "Thank you. Your enquiry is with us. Reference HE-…. We have emailed the details to [email]." The reference is always shown.
- *Then:* replace the form with this message and a Close button.
- *Email, from the official address:*
  1. Thank you, on behalf of [company].
  2. The reference.
  3. Either "you asked for a call on [day, date, time] India time, a consultant will confirm or offer another time", or "a consultant will contact you within one working day".
  4. What the call covers: the role, salary range, location, timeline.
  5. What follows: a recruitment services agreement before any work starts.
  6. Nothing is charged for the enquiry, the call or a shortlist.
  7. Link to the terms for employers.
  8. How to change or cancel the call: reply to this email.
  9. How to stop messages or ask for deletion: the privacy request form.
- *WhatsApp, one short message:* company, reference, call time or "within one working day", and how to opt out.
- *Until a WhatsApp service is connected:* record the consent, but do not mention WhatsApp in the email or on screen, and do not print "Reply STOP".
- *Gain:* removes the largest cause of lost leads. Closing the form also removes duplicate sends (finding 8).
- *Risk:* promising a channel that is not live; an email to a mistyped address.
- *Control:*
  - The draft columns for email status and WhatsApp status are filled on every enquiry.
  - Add a test: without the WhatsApp tick, the status is "no consent" and nothing is queued.
  - Add a test: with no mail key, the enquiry is still saved and the screen shows the reference.
  - Check U1.2 looks for "Reference: HE-" on screen. Update it to the new wording so it keeps proving the reference is visible.

**P4. Tell the owner, and make the badge honest** (finding 1)
- *Change:* email the owner's desk address on every new enquiry: company, contact, message, call time, link to the console. The tab badge counts new enquiries only.
- *Gain:* the owner no longer has to keep checking the console.
- *Risk:* none to data. The privacy notice must say this email is sent.
- *Control:* a test that the internal email is attempted and that a mail failure does not lose the enquiry; the console check Q "Employer enquiries" still opens the tab.

**P5. One "Calls" strip at the top of the Employer enquiries tab** (findings 5, 17, 20)
- *Change:* upcoming calls in time order, each showing day and time (India time), company, contact, phone, the message, and whether WhatsApp is allowed.
- *Four buttons:*
  1. **Confirm** – sends the confirmation with a calendar file.
  2. **Offer another time** – pick a slot; sends it.
  3. **Done** – opens the notes box.
  4. **Did not happen** – with a reason.
- *Each enquiry card gains:* "handled by", a notes box, "waiting since", and a red flag once one working day has passed without contact.
- *Gain:* nothing about the call is kept on paper or retyped.
- *Risk:* a wrong click sends a message.
- *Control:* a confirm step before any message goes out; each action is written to the access history, as status changes already are; new columns for handler and notes; a test for each status move.

**P6. "Create client from this enquiry", pre-filled** (finding 4)
- *Change:* a button on the card opens the existing client form with company name, contact name and work email already in place, and links the enquiry automatically. Mark "at least one role family" as required on screen.
- *Gain:* 4 retyped fields and about 4 clicks removed. The reload and the separate link step disappear.
- *Risk:* a wrong company name copied into the legal name.
- *Control:* leave "registered legal name" empty for the owner to type. The server link already exists and is proved by check F3.3 and the "merge 6" tests. Add one browser check that the button fills the three fields.

**P7. Check the phone number** (finding 6)
- *Change:* accept digits, spaces, "+" and "-"; require 10 digits for an Indian number or 10 to 15 with a country code; show "+91" as a hint.
- *Gain:* fewer dead leads and failed WhatsApp messages.
- *Risk:* a valid landline or foreign number refused.
- *Control:* tests with a mobile, a landline with STD code, "+44…" and "abc". The audit's sample numbers ("+91 90000 20001") must still pass.

**P8. Small form repairs** (findings 9, 10, 11)
- *Change:*
  - Employer wording under the form: "To correct or delete your enquiry, use the privacy request form."
  - Delete prompt for enquiries without "stored CV".
  - Browser hints on name, company, email and phone.
  - An error message that names the missing item.
- *Gain:* fewer typed characters on a phone and fewer failed sends.
- *Risk:* none to data.
- *Control:* the existing form checks still pass. The link to the privacy request form stays.

**P9. Update the privacy notice and its version with the form** (finding 13)
- *Change:* the notice lists the new fields (message, optional call time, WhatsApp choice) and states that an acknowledgement and an internal alert are sent. The version comes from one place, like the terms version.
- *Risk:* legal text; the owner should approve the wording.
- *Control:* a test that a new enquiry carries the current privacy and terms versions. F2.2 already checks the terms version is present.

**P10. Go live in a fixed order, and prove it** (finding 12)
- *Change:* database change first, program second. After release, send one test enquiry on the live site and delete it.
- *Risk if skipped:* every enquiry fails silently.
- *Control:* F2.1 and U1.2 must pass against the updated database before release. The other scripts and tests that still use the old fields (the recruiting end-to-end check and the merge-plan tests) must be run too.

### Suggested order

P10 → P1 → P3 → P4 → P2 → P5 → P6 → P7 → P8 → P9. P9 must ship together with P1 to P3.

---

## 5. What to leave alone, and why

1. **Both required ticks, with their date and version stamp.** They are the record of consent and of authority to act. The terms tick covers the fee and the 12-month clause; whether that is the right weight for an enquiry is a question for the owner's lawyer, not something to simplify away.
2. **The WhatsApp tick: optional and unticked.** Never merge it into the contact consent.
3. **The robot trap, the same-site check, the size limit and the hourly limit.** They are invisible to real employers and are the only spam protection.
4. **Owner-only access to enquiries.** Audit check F2.4 proves strangers cannot read them.
5. **The reference format HE-….** The owner, the audit and the planned search by reference rely on it.
6. **The four statuses (new, contacted, in progress, closed).** The audit sets "contacted". Add the meeting status beside them; do not rename.
7. **The position, location and hires columns.** Old enquiries and the tests use them. Stop asking, but do not delete.
8. **The enquiry-to-client link, and unlinking.** Built and tested (merge 6).
9. **Fee, guarantee, non-solicitation and matching rules on the client form.** These are the commercial terms and the access rules for the client. Pre-fill around them; never skip them.
10. **The one-time sign-in link for a new client.** Valid 7 days and usable once.
11. **Delete with a confirmation and an entry in the access history; the 12-month review flag.**
12. **Fee and replacement facts on /employers and in the "For employers" panel.** That is where an employer should find them.
13. **Accepting Gmail and similar addresses as "work email".** Many small Indian firms use them; blocking would lose real leads.
14. **Escape to close and keyboard focus kept inside the pop-up.** They work.

---

## Where

- **Public form:** `components/public-enquiry-dialog.tsx`
- **Buttons:** `app/home-client.tsx`, `components/landing-page.tsx`, `components/public-header.tsx`, `components/public-footer.tsx`
- **Employer page text:** `lib/landing.ts`
- **Saving an enquiry:** `app/api/employer-enquiries/route.ts`; checks in `lib/http.ts`
- **Draft acknowledgements and slot rules:** `lib/public-forms.ts`
- **Draft database change:** `drizzle/0021_enquiry_call_and_whatsapp_consent.sql`, `db/schema.ts`
- **Owner console:** `app/admin/admin-client.tsx` (Employer enquiries tab), `app/admin/portal-panel.tsx` (InviteClient)
- **Console server side:** `app/api/admin/records/route.ts`, `app/api/admin/records/[type]/[id]/route.ts`, `app/api/admin/portal/[action]/route.ts`, `lib/portal/client.ts`
- **Email and WhatsApp plumbing:** `lib/portal/mailer.ts`, `lib/portal/notify.ts`
- **Legal text:** `app/privacy/page.tsx`, `app/terms/employers/page.tsx`, `lib/terms.ts`
- **Checks to update or extend:** `scripts/audit/functional.mjs` (F2.1–F2.7, F3.1–F3.3), `scripts/audit/uat.mjs` (U1.1–U1.3, U2.1–U2.4), `scripts/audit/quality.mjs`, `scripts/check-recruiting-e2e.mjs`, `tests/merge-plan.test.mjs`, `tests/isolation.test.mjs`
- **Screenshots from this review:** `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/emp-ux/emp-dialog-desktop.png`, `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/emp-ux/emp-admin-enquiries.png`, `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/emp-ux/emp-admin-invite.png`
