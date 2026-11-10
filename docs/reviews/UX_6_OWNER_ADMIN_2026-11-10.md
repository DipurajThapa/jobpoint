# Workflow 6 review: Owner and administrator

Reviewed 10 November 2026 in the running local app (fictional test data) and in the code, by the DMAIC method. Findings already in the audit report of 10 November are not repeated; where I build on one, its reference is given (for example U2.5).

Two things I could only read in the code and did not run are marked "code only". My two test submissions (a client invite and a team invitation) were both refused by the server and left no record.

---

## 1. Define

**Who.** Two people share this workflow:
- The **owner** signs in through the hosting platform and uses the owner console at `/admin`.
- An **administrator** signs in at `/platform/sign-in` and uses the Working Platform: Team access, Operations, Assessments and Recruiting.

**What "done" means.**
- An enquiry becomes a client with agreed terms, and a recruiter is working it.
- A client's job is approved.
- A placement and its fee are recorded correctly.
- A privacy request is closed with proof.
- A team member has the right access.

**Defect opportunity.** Any field, click or message that the person does not need, cannot see, or that changes something without them meaning to.

---

## 2. Measure: the path as it is today

### 2.1 Owner console `/admin` (six tabs)

| Tab | What is on it | Fields and clicks |
|---|---|---|
| Open roles | "Post a verified role" form, then the list of roles | 11 fields and 1 tick box. 4 required (title, location, sector, description). Each role has 1 status drop-down (Draft, Published, Closed) that saves on change. |
| Candidate pipeline | Search box, then one card per website applicant | Download CV; "Correct profile" (9 fields, 5 marked required); "Withdraw optional consents" (1 confirmation); private notes (1 box, 1 button); Delete (1 confirmation). |
| Job portal | One page with 10 sections (detail below) | 5,471 px tall on a desktop with the test data; 16,082 px on a phone. |
| Employer enquiries | One card per enquiry | Up to 3 drop-downs (status, call status, "client it became") and Delete. All save on change. |
| Privacy requests | One card per request | Stage drop-down, outcome box, identity tick, an "erase" tick on deletion requests, Save. |
| Access history | Last 50 actions | Read only. |

**Job portal tab, section by section**

| Section | Fields and clicks |
|---|---|
| Overview | "Run scoring now"; "Issue link" (1 email, 1 drop-down). |
| One candidate list | Text only (a button appears if older applications are unlinked). |
| Clients → Invite a client | **39 controls**: 18 boxes, 20 tick boxes, 1 drop-down. 7 are marked required. An 8th (at least one "role family") is required by the server but not marked. |
| Managed searches | Per job: "Find candidates to submit"; per candidate, 1 required note and 1 button. |
| Placements | 1 status drop-down per row, saves on change. |
| Companies | Per client: Email Kit drop-down; "Change parameters" (28 controls); "Client terms" (4 browser pop-ups in a row); Suspend (1 confirmation). |
| Jobs awaiting approval | Approve (1 click); Reject (1 pop-up for the reason). |
| CVs needing manual review | 6 fields, 3 required. |
| Possible duplicates | 2 buttons per pair. 22 pairs in the test data. |
| Abuse flags; Candidates shared with clients | 2 buttons per flag; the log is read only. |

### 2.2 Working Platform (administrator)

| Screen | Fields and clicks |
|---|---|
| Sign-in | 2 fields. |
| Team access `/platform/admin` | Invite: name, email (required), role, 3 access drop-downs. Per person: 3 access drop-downs, 1 role drop-down, reset link, Disable, Delete. |
| Operations `/platform/admin/operations` | 6 sections. New team: 2 fields. New connection: 4 fields. 5 setting buttons (re-encrypt, pause invitations, switch off each of 3 tools). Data inventory. Activity list. |
| Assessments `/platform/assessments` | New bank: 3 fields. Add a question: 9 fields, 7 required. Upload: 1 box. Fast Track price: 2 fields. "Payment received": 1 pop-up. |
| Owner setup `/platform/owner` | 1 field (recover an administrator). 3 more only when no administrator exists. |

### 2.3 One real job, counted end to end: enquiry to "a recruiter is working this client"

1. Employer enquiries tab: read the card.
2. Job portal tab → "Invite a client": retype company, contact name and email (all three are already on the enquiry), type the legal name, tick at least one role family, press the button.
3. Copy the one-time link from the notice and send it.
4. Back to Employer enquiries: pick the client in the drop-down, then change the status.
5. Open the Working Platform (a second sign-in, 2 fields).
6. Recruiting → Clients: choose a team for the client.

That is 4 screens, 2 sign-ins and at least 4 typed fields, of which 3 are retyped. Step 6 is not mentioned anywhere in steps 1 to 5.

---

## 3. Analyse: findings, most costly first

### Finding 1. A correction cannot be saved for anyone who used the new short form
- **What happens.** "Correct profile" marks Location and Experience as required. The short form no longer asks for experience, and location is optional. For all 3 short-form applicants in the test data the browser refuses to save, with no message and no request sent. One open privacy request in the test data is exactly this case ("My phone number has changed").
- **Root cause.** The form's required marks are stricter than the server, which needs only name, a valid email and a phone number.
- **Who is affected.** The owner, and every applicant who asks for a correction, which is their legal right.
- **Where.** `app/admin/admin-client.tsx` (correction form); `app/api/admin/records/[type]/[id]/route.ts`.

### Finding 2. The candidate card and the search show nothing of what the CV said
- **What happens.** A short-form applicant's card shows name, email, phone, consents and a CV link. Skills, experience, education and availability are blank. The search is labelled "name, email, location, role or skill" but searches only the typed columns, so skill and role searches cannot find a new applicant.
- **Root cause.** The owner console reads the application row. What is read from the CV is stored on the candidate record, which this tab does not show.
- **Who is affected.** The owner, on every new applicant: each CV must be downloaded and opened to learn anything.
- **Where.** `app/api/admin/records/route.ts`; `app/api/applications/route.ts`.

### Finding 3. "Invite a client" fails silently on the first try
- **What happens.** I filled the three visible required fields and pressed "Create client and get sign-in link". The server refused with "Choose at least one permitted role family." That message appeared 2,186 px above the button, off the screen. At the button, nothing changed.
- **Root cause.** The role-family rule is not marked or pre-ticked, and the tab has one notice at the very top for actions made far below. The form has 39 controls; 20 of them are rules left from the old self-service model.
- **Who is affected.** The owner, on every new client.
- **Where.** `app/admin/portal-panel.tsx`; `lib/portal/params.ts`.

### Finding 4. A new client is invisible to recruiters until a team is chosen in a different product
- **What happens.** Recruiters see only clients that belong to their team. A newly invited client has no team. The team is chosen in Working Platform → Recruiting → Clients. The invite's success message does not say so, so work on the client waits without anyone being told.
- **Root cause.** Client set-up is split across two consoles with no hand-over step.
- **Who is affected.** Owner, recruiters and the new client.
- **Where.** `lib/portal/staff.ts`; `app/platform/recruiting/recruiting.tsx`.

### Finding 5. The owner's own client rules can block the owner's own approval (code only)
- **What happens.** The invite form's defaults allow only "junior" and "mid" seniority and no remote roles. If a client's job falls outside the rules, "Approve and go live" is refused. The owner must then use "Change parameters", which opens blank (U2.5), re-enter everything and approve again. No job was awaiting approval in the test data, so I did not run this.
- **Root cause.** The rules were built to control clients who served themselves. Now the owner reads and approves every job anyway.
- **Who is affected.** Owner and client.
- **Where.** `lib/portal/company.ts` (job approval); `lib/portal/params.ts`.

### Finding 6. A requested call can be marked "Confirmed" but the employer is told nothing
- **What happens.** The card shows the requested time and a drop-down (Confirmed, Held, Cancelled). Choosing "Confirmed" only stores the word; no email or WhatsApp goes out. The time cannot be changed, and who will take the call is not recorded. Enquiries are listed by arrival date, so there is no view of tomorrow's calls. The enquiry status ("new") is a separate drop-down and stays "new" after a call is confirmed.
- **Root cause.** The public side of call booking was built; the owner's side is one drop-down.
- **Who is affected.** The employer, at the first promise Jobboard300 makes to them, and the owner.
- **Where.** `app/admin/admin-client.tsx`; `app/api/admin/records/[type]/[id]/route.ts`.

### Finding 7. One slip on the Placements drop-down changes a placement, with no confirmation and no date
- **What happens.** Status saves the moment it is chosen. "Left in guarantee" or "replaced" stores no leaving date. It also pushes that candidate to the bottom of every shortlist for 12 months.
- **Root cause.** A high-consequence change uses the same control as a low-consequence one.
- **Who is affected.** Candidate (ranking), client (guarantee) and owner (fee record).
- **Where.** `app/admin/portal-panel.tsx`; `app/api/admin/portal/[action]/route.ts` ("placement-status"); `lib/portal/client.ts`.

### Finding 8. Other one-touch changes with large effects and no confirmation
- **What happens.**
  - Open roles: setting a role to "Closed" (consequences are in F13.5).
  - Team access: changing a person's role to Administrator.
  - Operations: "Disable" on a whole tool, for example Recruiting, for everyone.
  - Operations: "Remove" a member from a team (F14.8 covers the effect on their jobs).
  - Assessments: setting a live question bank to "Retired".
  
  Smaller actions (delete a team, cancel a Fast Track request) do ask first.
- **Root cause.** No common rule for which actions need a confirmation.
- **Who is affected.** Everyone downstream of the slip.
- **Where.** `app/admin/admin-client.tsx`; `app/platform/admin/team-access.tsx`; `app/platform/admin/operations/operations.tsx`; `app/platform/assessments/assessments.tsx`.

### Finding 9. Possible duplicates cannot be judged from the screen, and the screen says something untrue
- **What happens.** Each pair shows two names and a date. There is no email, phone, city or CV link to compare. The test data shows 22 pairs among 7 people; the test CVs come from one template, so I cannot say how many a real desk would see. The screen says "Until you resolve a CV duplicate, only the earlier record can be shown to companies", but nothing in the code holds the later record back. "Merge into earlier" cannot be undone.
- **Root cause.** The list shows the flag, not the evidence; the sentence describes a rule that was never built.
- **Who is affected.** The owner (guessing) and the candidate (a wrong merge joins two people's histories).
- **Where.** `lib/portal/views.ts`; `lib/portal/candidate.ts`; `app/admin/portal-panel.tsx`.

### Finding 10. Privacy requests: the instruction leads to a search that cannot find most people
- **What happens.** The tab says "Search the candidate records by email". That search covers website applications only. It does not cover portal accounts, client contacts or enquiries. The test data has an access request from a client contact, and nothing on screen shows what is held for her. There is no link from a request to the records, and no export for an access request. The "I verified the requester" tick is checked by the server but not stored.
- **Root cause.** The request card is a log entry, not connected to the person's data. The erase action already knows how to find every record by email.
- **Who is affected.** The owner (manual hunting, legal exposure) and the requester.
- **Where.** `app/admin/admin-client.tsx`; `app/api/admin/privacy-requests/[id]/route.ts`.

### Finding 11. The Job portal tab is one very long page with no signal of waiting work
- **What happens.** Ten sections sit on one page. The sidebar shows a count for every tab except this one, so jobs awaiting approval, CVs to review and duplicates are not signalled. On a phone the Placements table forces sideways scrolling (732 px wide on a 390 px screen), and only 3 of the 6 tabs are visible without swiping the menu.
- **Root cause.** Each new feature was added as another section of the same page.
- **Who is affected.** The owner, daily.
- **Where.** `app/admin/portal-panel.tsx`; `app/admin/admin-client.tsx`.

### Finding 12. "Client terms" is four pop-ups in a row
- **What happens.** Fee, guarantee days, non-solicitation months and other terms are each asked in a separate browser pop-up. Cancelling the fourth discards the first three. There is no summary before saving.
- **Root cause.** A shortcut used instead of a form.
- **Who is affected.** The owner, when changing the commercial terms of a client.
- **Where.** `app/admin/portal-panel.tsx`.

### Finding 13. The owner cannot see whether a candidate's acknowledgement went out
- **What happens.** Enquiry cards show "Acknowledgement email: sent / not sent" and the WhatsApp state. Candidate cards do not, although the same outcome is stored. On the test system every acknowledgement reads "not sent (email is not set up)" and "no WhatsApp number set up".
- **Root cause.** The record is kept in the message table and is not read by this tab.
- **Who is affected.** The owner, who cannot tell whether the promise on the confirmation screen was kept.
- **Where.** `app/api/applications/route.ts`; `app/api/admin/records/route.ts`.

### Finding 14. The one-time client sign-in link is plain text in a notice
- **What happens.** After an invite, the link is appended to the message at the top of the tab. The next action replaces it. There is no Copy button. Team access in the Working Platform already has a proper link box with Copy and "shown only now". This is the same weakness as U9.3a, in the owner console.
- **Root cause.** Two consoles built separately.
- **Who is affected.** Owner and the new client.
- **Where.** `app/admin/portal-panel.tsx`; `app/platform/admin/team-access.tsx`.

### Finding 15. Two consoles, two sign-ins, three activity lists (builds on U6.5, R5, R23)
- **What happens.** The Working Platform has no link to the owner console and the owner console has none to the Working Platform. The three activity lists show different things:
  - Access history (owner console): no actor.
  - Operations → Recent activity: raw internal codes such as "platform:u_URQd8azf…".
  - Team access → Recent access activity: readable names and emails.
- **Root cause.** Three logs with three presentations.
- **Who is affected.** Owner and administrator.
- **Where.** `app/admin/admin-client.tsx`; `app/platform/admin/operations/operations.tsx`; `app/platform/admin/team-access.tsx`.

### Finding 16. Team access does not say that invitations are paused
- **What happens.** Invitations were paused in Operations on the test system. The invite form looks normal. Only after filling it does the message "Invitations are paused in system settings" appear, with no link to the setting. Separately, "My account" tells people to "ask an administrator to change your name", but Team access has no name field, although the server accepts one.
- **Root cause.** A setting on one screen is not shown on the screen it affects.
- **Who is affected.** The administrator.
- **Where.** `app/platform/admin/team-access.tsx`; `app/api/platform/admin/users/route.ts`.

### Finding 17. Sidebar counts mean different things
- **What happens.** Employer enquiries counts all enquiries including closed ones. Privacy requests counts only open ones. Access history always shows 50. Candidate pipeline counts everyone.
- **Root cause.** Each count was added separately.
- **Who is affected.** The owner, who cannot read the sidebar as "work waiting".
- **Where.** `app/admin/admin-client.tsx`.

### Pareto ranking

Scores are my judgement: how often (1 = rare, 3 = daily or per applicant) times cost when it happens (1 = minutes, 3 = wrong outcome, legal exposure or a stalled client).

| Rank | Finding | How often | Cost | Score |
|---|---|---|---|---|
| 1 | 2. Card and search blind to the CV | 3 | 2 | 6 |
| 1 | 1. Correction cannot be saved | 2 | 3 | 6 |
| 1 | 3. Invite fails silently | 2 | 3 | 6 |
| 1 | 4. New client has no team | 2 | 3 | 6 |
| 1 | 6. Call "Confirmed" tells nobody | 2 | 3 | 6 |
| 6 | 11. Long page, no signal of waiting work | 3 | 1 | 3 |
| 6 | 7. Placement slip | 1 | 3 | 3 |
| 6 | 5. Own rules block approval | 1 | 3 | 3 |
| 6 | 8. One-touch changes | 1 | 3 | 3 |
| 6 | 10. Privacy request search | 1 | 3 | 3 |
| 6 | 9. Duplicates | 1 | 3 | 3 |
| 12 | 13. Candidate acknowledgement not shown | 2 | 1 | 2 |
| 12 | 14. Link in a notice | 2 | 1 | 2 |
| 12 | 12. Four pop-ups | 1 | 2 | 2 |
| 12 | 15. Two consoles, three logs | 2 | 1 | 2 |
| 16 | 16. Paused invitations | 1 | 1 | 1 |
| 16 | 17. Sidebar counts | 1 | 1 | 1 |

The five findings at the top make up half of the total score. Four of them (1, 2, 3, 6) are single-screen changes.

---

## 4. Improve and Control: proposals

Each proposal gives the smallest change, the gain, the risk, and the control that proves nothing broke. Check references such as F3.2 are in `scripts/audit/functional.mjs`.

### Proposal 1 (Finding 1). Make the correction form ask only for what the server needs
- **Change.** Keep Name, Email and Phone required. Remove the required mark from Location and Experience. Nothing is removed.
- **Gain.** Corrections become possible for every short-form applicant (today 0 of 3).
- **Risk.** None to data: the server rule is unchanged and blank values are already what is stored.
- **Control.** `tests/fixes.test.mjs` (profile correction) still passes. Add one audit check: "the owner corrects the phone of a short-form applicant and `applications.phone` and `candidates.phone` both change".

### Proposal 2 (Finding 2). Show what the CV said on the candidate card, and search it
- **Change.** Add a read-only line to each card from the candidate record: latest job title, years, city, top skills. Make the search also match that. Keep the typed fields for older applications.
- **Gain.** Removes one CV download per applicant for a first look.
- **Risk.** The owner must not mistake CV-read values for confirmed facts; label the line "Read from the CV".
- **Control.** F5.19 ("the candidate pipeline shows the application, its role and that it is in the candidate list") still passes. Add a check that searching a skill from the CV finds a short-form applicant.

### Proposal 3 (Findings 3, 5). Shorten "Invite a client" from 39 visible controls to 11, without removing any stored value

| Field | Verdict | Stored in | Read by | Proposal |
|---|---|---|---|---|
| Company name | Needed now | `companies.display_name` | Every client screen | Keep; prefill from the enquiry (Proposal 4). |
| Registered legal name | Needed now (contract) | `companies.legal_name` | Companies list | Keep required. |
| City, Website, GSTIN | Ask later | `companies` | Companies list | Keep optional. |
| Owner's name | Needed now | `company_users.display_name` | Client workspace | Keep; prefill. |
| Owner's work email | Needed now | portal account | Sign-in, invitation | Keep required; prefill. |
| Fee %, guarantee days, non-solicitation months | Needed now (commercial terms) | `companies` | Placement fee and dates | Keep required with today's defaults. |
| Other fee terms | Optional | `companies.fee_terms` | Placements table | Keep. |
| Role families (12 ticks) | Needed by the server, not by the owner at this moment | `company_parameters` | Job approval only | Pre-tick all. Move under a closed "Matching rules (advanced)" section. |
| Seniority (5 ticks) | Same | Same | Job approval only | Pre-tick all; same section. |
| Cities, CTC band, remote | Ask later | Same | Job approval only | Same section. The owner decides the remote default once. |
| Minimum match score, maximum notice, 3 mandatory filters | Needed by matching; defaults are fine | Same | Matching | Same section, defaults unchanged. |
| Maximum live jobs | Needed | Same | Limit on live jobs; shown to the client | Same section, default 10. |
| Maximum CVs released per job | Not needed on screen (never enforced, R24) | Same | Nothing | Hide the box; keep sending the default so the stored value and the server field stay. |

Also put the error message next to the button that caused it.

- **Gain.** 28 controls move out of sight. The hidden required tick disappears. The first attempt succeeds.
- **Risk.** Pre-ticking everything widens what a client's job may be. That is safe only because the owner approves every job by hand; Finding 5 shows the narrow defaults currently work against the owner.
- **Control.** F3.2 (client stored active with fee, guarantee and non-solicitation), F3.6 and F3.7 (refusal leaves no half-made company), F4.7 (owner approves and the job goes live). Add a check: "an invite sent with only the visible fields succeeds".

### Proposal 4 (Finding 4, builds on U2.2). Finish client set-up in one place
- **Change.**
  - Add "Create client from this enquiry" on the enquiry card. It opens the invite form with company, contact name and email filled, and sends the enquiry's reference with it. The server already accepts that and links the two.
  - Add a "Team" drop-down to the invite form and to each client under Companies, using the same action the Recruiting tool uses.
  - Until a team is set, show "No team yet: recruiters cannot see this client" on the client's line.
- **Gain.** 3 retyped fields, 1 drop-down (the manual enquiry link), 1 screen and 1 sign-in removed. The silent wait is removed.
- **Risk.** The team action checks that the person is an administrator; the owner console must go through the same check, not around it.
- **Control.** F3.3 (the enquiry remembers the client it became), F4.8 (the team's recruiter sees the live job), F4.9 (a recruiter on another team does not), and the enquiry-link tests in `tests/merge-plan.test.mjs`.

### Proposal 5 (Finding 6). Give the requested call an owner's side
- **Change.**
  - When "Confirmed" is chosen, send the employer the confirmation by email, and by WhatsApp only if they ticked the box. Show the result on the card, as the acknowledgement line already does.
  - Add "Propose another time" (date and time), which sends the same message.
  - Sort enquiries with an open call by call time, and show "Calls: today N, tomorrow N" at the top.
  - When a call is marked "Held", move a "new" enquiry to "contacted".
- **Gain.** One separate email per call and one drop-down change per enquiry removed. The employer gets a definite answer.
- **Risk.** WhatsApp must stay tied to the tick. A changed time must free the old slot, because one slot can hold only one request.
- **Control.** F2.6a (a booked slot is not offered twice), F2.6b (no WhatsApp without the tick), F2.6d (confirmation is stored), and the `whatsapp_consent`, `meeting_at` and `meeting_status` columns on the enquiry. Add a check: "confirming a call records an outgoing email".

### Proposal 6 (Finding 7). Make a placement change deliberate
- **Change.** Replace the drop-down with a "Change status" button. It opens a small form with the new status, a leaving date (required for "left" and "left in guarantee") and a note, and a line stating the effect ("this person will rank last on shortlists for 12 months").
- **Gain.** Removes the one-slip defect. Adds 1 click on a rare action.
- **Risk.** None to data; the same action and columns are used.
- **Control.** F10.6, F10.7 and F10.9 still pass. Add a check that "left in guarantee" from the owner console stores `placements.left_on`.

### Proposal 7 (Finding 8). One rule for confirmations
- **Change.** Ask "Are you sure?", with the consequence in one sentence, for exactly these: close a role; make someone an administrator; switch a tool off; remove a person from a team; retire a live question bank. Do not add confirmations anywhere else.
- **Gain.** Five slip opportunities removed, at the cost of 1 click each on rare actions.
- **Risk.** None.
- **Control.** F14.1 to F14.3 (access checks) unchanged. The UAT script presses these controls and must accept the new dialog.

### Proposal 8 (Finding 9). Let the owner judge a duplicate, and make the sentence true or remove it
- **Change.** On each pair show, for both records: email and phone (masked to the last 4 characters), city, where the record came from, and "Open CV". Change the sentence to what actually happens. If the owner wants later records held back until resolved, that is a new rule to build and test, not a wording change. Add a confirmation that says a merge cannot be undone.
- **Gain.** A decision replaces a guess. No fields are added for the owner to fill.
- **Risk.** Showing contact details here is a new place personal data appears; it must be written to the access record like other CV views.
- **Control.** `tests/merge-plan.test.mjs` and `tests/fixes.test.mjs` (merge and duplicate flags) still pass. The CV view writes an access record, as the manual-review view already does.

### Proposal 9 (Finding 10). Connect a privacy request to the person's records
- **Change.** On each request show "Held for this email: N website applications, portal account yes/no, N enquiries", using the same look-up the erase action uses, with a "Show" button that filters the Candidate pipeline. Store who ticked "I verified the requester" and when. Correct the instruction text.
- **Gain.** Removes a manual search across tabs for every request. Gives proof of verification.
- **Risk.** None to existing data; one new stored value.
- **Control.** F6.3 and F6.4 still pass; `tests/erasure.test.mjs` unchanged. Add a check that the count shown equals what an erase would remove.

### Proposal 10 (Findings 11, 17). Split the Job portal tab by task and make the sidebar mean "work waiting"
- **Change.** Keep every section, in three sidebar entries:
  - "Clients": invite, companies, placements.
  - "To review": jobs awaiting approval, CVs to review, duplicates, abuse flags. Shows a count.
  - "Searches and log": managed searches, shared-with-clients log, scoring.
  
  Make each sidebar count the number of open items. Let the Placements table scroll inside its own box on a phone.
- **Gain.** The owner sees at a glance what is waiting. No scrolling past 4,000 px to reach approvals.
- **Risk.** The auditors find sections by their headings; the headings must not change.
- **Control.** F4.6 (the console lists the job awaiting approval) and the quality auditor's phone-width check, extended to `/admin`.

### Proposal 11 (Finding 12). Replace the four pop-ups with one small form
- **Change.** "Client terms" opens a 4-field form, prefilled with current values, with one Save. The same fields already appear on the invite form.
- **Gain.** 4 pop-ups become 1 form; a cancel no longer loses three answers.
- **Risk.** None.
- **Control.** F3.2 checks the same four stored values.

### Proposal 12 (Finding 13). Show the acknowledgement outcome on the candidate card
- **Change.** Add the same line the enquiry card has: "Acknowledgement email: sent / not sent · WhatsApp: …". When email is not set up, show one banner at the top of the console: "Email is not set up: N acknowledgements were not sent".
- **Gain.** The owner can see whether the on-screen promise was kept, with no extra clicks.
- **Risk.** None.
- **Control.** F5.15b (the acknowledgement is recorded) and F2.6c.

### Proposal 13 (Finding 14). Use the Team access link box in the owner console
- **Change.** Show the client's one-time link in the same box (Copy button, "works once, valid 7 days, shown only now") and keep it until "Done" is pressed.
- **Gain.** Removes a lost-link defect on every invite.
- **Risk.** None.
- **Control.** F3.2 and the UAT step that reads the link after inviting.

### Proposal 14 (Findings 15, 16). Small joins between the two consoles
- **Change.**
  - Add "Working Platform" in the owner console sidebar and "Owner console (needs two-step sign-in)" in the Working Platform menu for administrators (R5).
  - Show names instead of internal codes in Operations → Recent activity, the way Team access already does.
  - On Team access, show "Invitations are paused, resume them in Operations" above the invite form when that is the case.
  - Add a name field for the administrator to edit; the server already accepts it.
- **Gain.** Removes two dead ends and one failed submission.
- **Risk.** The link to the owner console must not weaken the two-step rule; it is a link only.
- **Control.** F14.2 (a recruiter cannot reach owner or administrator screens) and `tests/access-control.test.mjs`.

### Order to do them in
1. First, because the short form is already live on this branch: Proposals 1, 2 and 12.
2. Then Proposals 3, 4 and 13, which fix client set-up.
3. Then Proposal 5 for calls.
4. Then Proposals 6, 7, 9 and 8.
5. Then Proposals 10, 11 and 14.

---

## 5. Risks in the decisions already taken, seen from the owner's desk

1. **Short candidate form (decision 1).** It works on the public side. On the owner's side it breaks corrections (Finding 1) and empties the card and search (Finding 2). Proposals 1 and 2 are the price of the shorter form and should ship with it.
2. **Email and WhatsApp acknowledgement (decision 2).** On the test system no email service and no WhatsApp number are set up, so every acknowledgement is recorded as not sent. The consent rule is respected: nothing is queued without the tick. Before going live, the mail keys must be set and one real message sent; Proposal 12 makes a failure visible.
3. **Enquiry with a call (decision 3).** The employer can ask for a time, but the owner's answer reaches nobody (Finding 6). Until Proposal 5 is done, every "Confirmed" needs a manual email.
4. **Fee and 60-day replacement are employer facts (decision 4).** In this workflow they appear only in the owner console (client terms, placements), which is correct. Nothing to change here.
5. **New header and footer (decision 5).** Staff sign in at `/platform/sign-in`, but that sign-in has no way on to the owner console (Finding 15). Proposal 14 closes this.

---

## 6. What to leave alone, and why

1. **The identity tick and required outcome note before closing a privacy request, and the separate "erase" tick.** These are the legal safeguards and they are tested (F6.3). Keep both ticks separate.
2. **The confirmations on Delete, Suspend, Merge and "Withdraw optional consents".** Keep them; R16 already asks for a fuller wording on the last one.
3. **The itemised consent line on each candidate card** (CV sharing, future contact, WhatsApp). It is the owner's only view of what may be done with the person. Do not merge it into one label.
4. **"Ask first" on candidates who have not agreed to sharing, with no Submit button.** This is the access check working. R3 covers the missing way to record consent.
5. **The required recruiter's note when submitting a candidate.** The client reads it; it is tested (F7.7).
6. **The fee limits (7.5 to 8.33), guarantee (0 to 365 days) and non-solicitation (0 to 36 months) checks.** They protect the commercial terms.
7. **The acknowledgement line on enquiry cards.** It is plain and honest ("not sent (email is not set up)", "not agreed, do not message"). Copy it, do not change it.
8. **Team access in the Working Platform.** Its link box, plain-language access levels and readable activity list are the best pattern in this workflow.
9. **"Invite a recruiter to your team" in the Recruiting tool.** It is 3 fields and already puts the person in the right team with the right tool. Point to it from Team access rather than rebuild it.
10. **Operations → Data inventory.** Numbers only, changes nothing, one button.
11. **Connections stay disabled until tested, and tokens are never shown again.** Correct as built.
12. **The Assessments question form (9 fields) and upload box.** Every field is used by the test, and the per-level counts tell the administrator what is missing.
13. **The two-step sign-in requirement for an administrator to open the owner console.** Do not relax it to make navigation easier.
14. **The CV manual-review form (6 fields).** This is the one place where retyping is the point, and it is rare.
