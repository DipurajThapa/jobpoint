# Six Sigma review: Recruiter and team manager workflow

Reviewed on 10 November 2026 in the running app, signed in as the test recruiter (Noor) and, for the manager-only sections, as the administrator. Nothing was saved during the review: where I needed to see a confirmation, I faked the server's reply in the browser.

Four things were not exercised and are reported from the code only:
- There is no team-manager test account, so a manager's own view was not seen. The manager sections were seen as the administrator.
- Both test jobs have no entry at "Submitted", "Shortlisted", "Interviewing" or "Offer made", so the interview form, the reason, salary and joining-date forms, and the test sender were read in the code, not on the screen.
- The invitation acceptance screen needs a real invitation link, which I did not create.
- I did not turn on two-step sign-in for the test account.

Findings already in the audit report of 10 November are cited by their reference (for example F9.19) and not counted as new.

---

## Define

- **Who:** a recruiter (works jobs for their team's clients) and a team manager (also assigns jobs, invites recruiters, sets the team's WhatsApp number).
- **Their goal:** put the right candidate in front of the client quickly, then keep each candidate moving to "Joined".
- **Done for the recruiter:** candidate submitted with a note, and each later step recorded.
- **Done for Jobboard300:** a placement with a salary and a fee, every contact view on record, consent respected.

---

## 1. The path as it is today

### 1.1 Screens and counts

| # | Screen | What the person does | Fields | Clicks |
|---|---|---|---|---|
| 1 | Sign in | Types work email and password | 2 required (plus 1 code if two-step sign-in is on) | 1 |
| 2 | Dashboard | Sees "Welcome, Noor" and one card, "Recruiting" | 0 | 1 |
| 3 | Recruiting: Jobs list | Reads title, client, openings, in process, joined, assigned to. Presses "Open" | 0 | 1 |
| 4 | Job opened: Pipeline | One row per submitted candidate, with stage, interviews, tests and commitment | see 1.2 | see 1.2 |
| 5 | Job opened: Candidates to submit | Three candidates at a time | see 1.2 | see 1.2 |
| 6 | Recruiting: Clients table | Read only for a recruiter (client, city, status, team) | 0 | 0 |
| 7 | Team members, invite, WhatsApp set-up | Manager and administrator only | see 1.3 | see 1.3 |
| 8 | My account | Change password, two-step sign-in | see 1.4 | see 1.4 |

Shortest path from sign-in to the first submission: **3 screens, 5 clicks, 3 typed fields** (email, password, the note to the client).

### 1.2 Actions inside an opened job

| Action | Fields | Required / optional | Clicks | Confirmation step |
|---|---|---|---|---|
| Show phone and email | none | – | 1 | Appears in the row. Counted against a daily limit (25 recruiter, 50 manager) |
| Submit to client | Note ("Why this candidate, notice, CTC, availability") | Required, one-line box, up to 2,000 characters | 1 | None |
| Pass | Reason (8 choices) | Required | 1 | None, and it cannot be undone (F7.16) |
| Update stage to Shortlisted | Note | Optional | choose + Save | Form with Cancel |
| Update stage to Not selected, Withdrawn, Offer declined, Did not join | Reason; Note | Reason required; note optional | choose + Save | Form |
| Update stage to Offer made | Offered annual salary (LPA); Note | Both optional | choose + Save | Form |
| Update stage to Offer accepted | Expected joining date; Note | Date required | choose + Save | Form |
| Update stage to Joined | Joined on (pre-filled with today); Note | Date required | choose + Save | Form |
| Schedule interview | Round; Date and time; Mode (Video pre-chosen); Link or address; Interviewer | 2 required, 1 pre-filled, 2 optional | 1 to open + Schedule | Form |
| Send a test | Choose a test | – | 1 choice | None: sent the moment it is chosen |
| Get a new commitment link | none | – | 1 | None: the old link stops working at once |
| Aptitude test tick box | 1 tick | – | 1 | None: saved at once (manager or administrator only) |

### 1.3 Team manager and administrator sections

| Action | Fields | Clicks | Confirmation step |
|---|---|---|---|
| Assign job to a person | 1 choice | 1 | None: saved at once |
| Assign client to a team (administrator only) | 1 choice | 1 | None |
| Make someone team manager (administrator only) | 1 tick | 1 | None |
| Remove from team | none | 1 | Yes, a confirm box |
| Invite a recruiter | Team, Name, Work email: 3 required | 1 | Shows a one-time link valid for 72 hours |
| WhatsApp set-up, per team | Number; "Use this number" tick; administrator also has "Override team numbers" | 1 Save | None |

### 1.4 My account

| Action | Fields |
|---|---|
| Profile | Read only (name, email, role, tool access) |
| Change password | 3 required (current, new, repeat) |
| Turn on two-step sign-in | 1 (current password), then 1 (six-digit code) |
| Turn it off | 2 (password, code) |
| Forgot password | No form: the page says to ask an administrator for a reset link |

### 1.5 What I measured on the screen

- Both test jobs show "1 opening(s) · 0 in process · 1 joined" and still offer three candidates to submit (F9.19).
- Of the 6 shortlist places across the two jobs, **5 are held by people who cannot be submitted** ("Has not agreed to their CV being shared with employers. Ask them first.").
- The WhatsApp queue shows "73 skipped", none queued and none sent.
- At phone width (360 px), one opened job makes the page about 3,070 px tall, roughly four screens of scrolling.

---

## 2. Defects and waste, most costly first

### New findings

**1. The confirmation appears where the person is not looking.**
Every message ("Submitted to the client", errors, one-time links) is shown once at the very top of the page. The buttons are far below it. After "Submit to client" the message was 584 px above the visible screen on a desktop and 1,085 px above on a phone. After "Get a new link", the link itself was out of view.
- Root cause: one shared message line for the whole page, with no scroll to it and no message beside the button pressed.
- Who is affected: every recruiter on every action. They cannot tell whether a submission went through, and a refusal (daily limit, no consent, someone else changed it) goes unseen.

**2. The recruiter cannot see what the job is.**
The job card shows the title, client, openings and counts only. There is no location, salary, experience, must-have skills or description. The recruiter has to phone a candidate and write "why this candidate" for the client with only the job title to go on.
- Root cause: the list sent to the Recruiting screen carries only the title, status and counts.
- Who is affected: every recruiter and every candidate they call. Combined with the audit's finding that the CV cannot be opened (U7.5), the recruiter sees neither side of the match.

**3. One-time links are shown as plain text, vanish on the next action, and break the page on a phone.**
The commitment link, the test link and the recruiter invitation link are appended to the top message as text. There is no Copy button and no way to click it. The next action replaces it, and the invitation link cannot be shown again. On a phone the link widened the page from 360 to 623 px, so the whole page scrolls sideways.
- Root cause: links travel through the same one-line message as everything else. (The audit asked for a link box with Copy, U9.3a; the loss of the link and the phone breakage are new.)
- Who is affected: recruiters and managers, and the candidate or new recruiter who never receives the link.

**4. A job can be assigned to a person who cannot work it, and it then disappears from everyone else.**
The "Assign to" list offers every member of the team, including a view-only member (Vik Viewer is offered in the test data). A job assigned to someone is hidden from the other recruiters. A view-only person cannot submit or pass, so the job stalls with nobody told.
- Root cause: assignment checks team membership only, not whether the person may edit.
- Who is affected: the client (no candidates arrive), the team manager (finds out late).

**5. Assigning or re-assigning a job tells nobody, and saves on a single choice.**
Choosing a name saves at once with no confirm. The person who receives the job gets no notice; the person who loses it simply stops seeing it.
- Root cause: no notice is written on assignment; the control is a bare list.
- Who is affected: recruiters, team managers.

**6. A team manager's invitation is a dead end if the link expires or the person was removed.**
The link lasts 72 hours. If it runs out, or a member was removed and should come back, the manager gets "This email already has an account. Ask an administrator to add that person to your team." There is no "send a new link" for the manager.
- Root cause: the invite refuses any email that already exists, even one still waiting on this manager's own invitation.
- Who is affected: team managers (franchise managers especially), the administrator who is interrupted.

**7. The invited recruiter's name is typed twice.**
The manager must type the name; the invited person must then type "Your name" again on an empty required box, and that second entry replaces the first.
- Root cause: the acceptance form does not show the name already held.
- Who is affected: every new recruiter (1 wasted field), and the manager (a required field with no lasting effect).

**8. "Get a new link to send" is offered when it no longer makes sense.**
It shows on candidates at "Joined", "Did not join" and "Offer declined" (three rows in one test job). Pressing it creates a fresh link and kills the old one, with no confirm.
- Root cause: the button depends only on "not yet accepted", not on the stage. The server has the same gap.
- Who is affected: recruiters (noise, one-click mistake), candidates (could be asked to accept a commitment for an offer they declined).

**9. "Pass" has no place for a note, so "other" teaches nothing.**
The screen says pass reasons are reviewed to improve matching. The system can already store a note with each pass, but the screen has no box for it. A pass for "other" is saved blank.
- Root cause: the note box was never added to the screen.
- Who is affected: the owner and whoever tunes matching.

**10. The note to the client is written in a one-line box.**
It is the main piece of writing the client reads. It holds up to 2,000 characters and asks for four things at once, on one line.
- Root cause: a single-line input was used.
- Who is affected: recruiters (cannot see what they wrote), clients (thin, uneven notes).

**11. Daily limits are invisible until they stop the person.**
Contact views are limited to 25 a day (50 for a manager) and passes to 15 per job per day. Nothing shows how many are left. The refusal then appears at the top of the page, out of view (finding 1).
- Root cause: the count is kept but not shown.
- Who is affected: recruiters in the middle of a calling session.

**12. The phone number and email are plain text.**
They cannot be tapped to call or to open WhatsApp or email, and they are forgotten when the job is closed and re-opened.
- Root cause: shown as text only.
- Who is affected: recruiters working from a phone.

**13. Interview times carry no time zone.**
The Recruiting screen shows and takes times in whatever zone the device is set to, with no label. The candidate's message says "India time". A device set to another zone shows a different hour (the test interview at 4:30 pm India time showed as "11:00 am").
- Root cause: times are formatted without fixing them to India time.
- Who is affected: any recruiter or franchise working from a device not set to India time.

**14. The dashboard is an empty step for a recruiter.**
A recruiter has one tool. The dashboard shows a greeting and one card, and costs a click every session. The card's badge reads "Edit access", which means nothing to a recruiter.
- Root cause: everyone lands on the dashboard whatever their tools.
- Who is affected: every recruiter, every sign-in.

**15. Phone-width faults on the Recruiting screen.**
The page is 2 px wider than the screen, so the role line is cut at the right edge. "Get a new link to send" is 16 px tall and the tick box 13 px, both too small to tap reliably. The audit did not check signed-in pages at phone width.
- Root cause: the screen was laid out for a desktop.
- Who is affected: recruiters on phones.

**16. Small on-screen faults.**
- The menu does not highlight "Recruiting" when you are on it (Dashboard and My account do highlight).
- The aptitude tick box sits centred on its own line above its sentence.
- The WhatsApp section states "No WhatsApp provider is connected yet" as fixed text, so it will be wrong the day one is connected.

### Known findings that drive most of the cost here (not new)

- **A.** No CV, no phone after submission, client feedback not shown (U7.5, U7.7, U8.9a).
- **B.** A candidate without sharing consent cannot be submitted and no screen can record consent (R3). The only way to clear them is to pass, which cannot be undone (F7.16). This is why 5 of 6 places are blocked.
- **C.** Filled jobs stay live (F9.19); the score is visible in the summary line (R29); controls the person cannot use are shown (R6); "Applied to this role" is not shown (R4).
- **D.** Staff cannot record or reschedule an interview (F8.24, F8.25); past dates are accepted (F8.18).
- **E.** Salary is optional at offer (F10.3b); the recruiter's "Offer accepted" form lacks last working day and other offers (F9.13).
- **F.** No "what changed" list (F8.35).

### Pareto ranking

Scored by how often it happens and what it costs each time.

| Rank | Finding | How often | Cost each time |
|---|---|---|---|
| 1 | B (known): shortlist places blocked by missing consent | Most candidates from the website | Recruiter cannot proceed at all |
| 2 | 2 and A: recruiter sees neither the job nor the CV | Every candidate | Poor calls, weak notes, wrong submissions |
| 3 | 1: confirmation out of view | Every action | Doubt, double work, missed refusals |
| 4 | 3: links as text, lost, phone breakage | Every offer, test and invitation | Candidate or recruiter never gets the link |
| 5 | 4 and 5: assignment to the wrong person, in silence | Each assignment | A job stalls unseen |
| 6 | 6 and 7: invitation dead end and duplicate name | Each new recruiter | Administrator interrupted |
| 7 | 8, 9, 10, 11: commitment link on closed rows, pass note, one-line note, hidden limits | Daily | Minutes, and lost learning |
| 8 | 12 to 16: tap-to-call, time zone, dashboard step, phone layout, small faults | Daily | Seconds each |

The first four rows account for most of the lost time. Rows 1 and 2 are already on the audit's fix list; rows 3 and 4 are new.

---

## 3. Proposals

Each gives the smallest change, the gain, the risk, and the control that proves nothing broke.

**P1. Show the result beside the button that was pressed** (finding 1).
- Change: put the message inside the candidate's row or the job, and keep it on screen until the next action on that row. Keep the top message only for page-wide errors.
- Gain: no scrolling to check; refusals are seen.
- Risk: low; display only.
- Control: add a check to the UAT auditor that after "Submit to client" the confirmation is inside the visible screen at desktop and phone size. Existing checks F7.8 to F7.12 still prove the submission is stored.

**P2. A link box with Copy and "Send on WhatsApp / email", kept until dismissed** (finding 3).
- Change: show any one-time link in its own box under the row it belongs to, wrapping on a phone.
- Gain: no retyping, no lost links, no sideways scrolling.
- Risk: low. The link must still be shown only to the person who created it, and only once.
- Control: F9.6 and F9.7 (new link issued, old one stops) and F1.3 (invitation accepted) still pass. Add a UAT check that the page is no wider than the screen at 360 px after a link is shown.

**P3. Show the job's essentials on the job card** (finding 2).
- Change: add location, work mode, salary range, experience and the must-have list (read only) to the opened job.
- Gain: the recruiter no longer needs another screen or a phone call to learn what the job is.
- Risk: low; this is data the team may already see. Nothing is added to what clients or candidates see.
- Control: the team-scope checks F4.9 and F7.3 and the test "a recruiter works only on their own team's clients, jobs and pipelines" must still pass, so no other team's job details leak.

**P4. Offer only people who can work the job in "Assign to", and confirm the change** (findings 4 and 5).
- Change: list only team members with edit access; show a one-line confirm; write a notice to the person receiving the job (this fits the "What changed" list the audit already asks for, F8.35).
- Gain: no stalled jobs; no silent hand-overs.
- Risk: low. A job already assigned to a view-only person should be shown to the manager as "needs re-assigning", not silently cleared.
- Control: add a functional check that assigning to a view-only member is refused. The existing test "a job assigned to a colleague is hidden" must still pass.

**P5. Let a manager issue a fresh link for their own pending invitation, and re-add a removed member** (finding 6).
- Change: when the email belongs to a person still "invited" in this manager's team, offer "Create a new link". When the person was removed from this team earlier, allow the manager to add them back.
- Gain: one administrator interruption removed per case.
- Risk: medium. It must not let a manager pull in someone from another team or change anyone's access. Keep the rule that a manager acts only inside their own team.
- Control: the test "staff permissions: no tool, view-only, disabled account, and non-admin on admin routes" and F14.8 still pass. Add a check that a manager cannot re-issue a link for a person outside their team.

**P6. Pre-fill the invited person's name** (finding 7).
- Change: show the name the manager typed in the "Your name" box, still editable.
- Gain: 1 field removed for every new recruiter.
- Risk: none; the name is still stored in the same place.
- Control: F1.3 (invitation accepted, account active).

**P7. Offer "Get a new link" only at "Offer made" and "Offer accepted", with a confirm** (finding 8).
- Change: hide it on closed rows and on "Joined"; refuse it on the server for those stages; confirm before the old link is cancelled.
- Gain: three needless buttons removed in the test job alone; no accidental cancellation.
- Risk: low. A joined candidate who never accepted stays recorded as "not yet accepted", which is true.
- Control: F9.6, F9.7 and F9.10 still pass. Add a check that a new link is refused after "Offer declined".

**P8. Add an optional note to Pass, required only for "other"** (finding 9).
- Change: one short box beside the reason.
- Gain: pass reasons become usable for tuning matching. Cost: one optional field.
- Risk: none; the storage already exists.
- Control: F7.14 (reason required and stored); extend it to read the note back.

**P9. Make the note to the client a multi-line box with four prompts** (finding 10).
- Change: a taller box with the prompts "Why this candidate · Notice period · Current and expected salary · Availability" as guidance. Still one required field.
- Gain: better notes with no extra fields. This is not work moved to someone else: the recruiter already has to write it.
- Risk: none.
- Control: F7.7 (empty note refused), F7.9 and F8.1 (note stored and shown to the client).

**P10. Show what is left of the daily limits** (finding 11).
- Change: "Contact views today: 7 of 25" near the candidates, and the same for passes on the job.
- Gain: no surprise stop mid-session.
- Risk: none. The limits stay exactly as they are.
- Control: the tests "contact views have a daily limit…" and "staff see contact details one candidate at a time…" still pass.

**P11. Make phone and email tappable** (finding 12).
- Change: tap to call, tap to email. Still shown one person at a time after the same click.
- Gain: no retyping a number.
- Risk: low. Do not add any "copy all" or list; do not keep the details in the browser between visits.
- Control: F7.5 and F7.6 (each view recorded), and the test "no staff route hands out a CV file or a list of contact details".

**P12. Fix interview times to India time and say so** (finding 13).
- Change: show "India time" beside every time and treat the form's time as India time.
- Gain: the recruiter, client and candidate all read the same hour.
- Risk: medium. Times already stored must not shift.
- Control: F8.13 (stored time equals the time entered) and F8.16. Add a check with the browser set to another zone.

**P13. Take a person with one tool straight to it** (finding 14).
- Change: after sign-in, if the person has exactly one tool, open it. Keep the Dashboard link in the menu.
- Gain: 1 click and 1 screen removed per session.
- Risk: low. People with several tools, or none, still see the dashboard.
- Control: the UAT recruiter story still reaches the Recruiting screen; the access tests are untouched.

**P14. Phone layout and small faults** (findings 15 and 16).
- Change: remove the 2 px overflow, give links and tick boxes a 44 px tap area, highlight the current tool in the menu, set the aptitude tick beside its sentence, and make the WhatsApp provider sentence depend on whether one is connected.
- Risk: none.
- Control: extend the quality auditor's 360 px sideways-scroll check to the three signed-in pages.

**P15. Order of work with the known findings.**
Do R3 (record consent), F7.16 (undo a pass) and U7.5 (view CV) first: they unblock the 5 of 6 places and are the top of the Pareto. Then P1 to P4.

### Field by field: keep, read from the CV, ask later, or not needed

| Field | Verdict | Where it goes and who reads it |
|---|---|---|
| Sign-in email, password, code | Needed now | Access check. Leave as is |
| Note to the client (submit) | Needed now | Stored on the pipeline row; shown to the client. Notice period and salary cannot be reliably read from a CV, so they stay in the note |
| Pass reason | Needed now | Stored with the pass; read by the administrator |
| Pass note | Add as optional (P8) | Storage already exists |
| Stage reason (the four closing stages) | Needed now | Stored on the pipeline row; shown to staff and the client; never to the candidate |
| Stage note | Optional, keep | Pipeline history |
| Offered salary | Needed now, and should be required (already F10.3b) | Sets the placement's salary and the fee |
| Expected joining date / Joined on | Needed now | Sets the guarantee end date and the joining follow-up |
| Last working day, other offers | Ask later, at "Offer accepted" | The storage and the client's form have them; the recruiter's form does not (F9.13). Add as optional |
| Interview round, date and time | Needed now | Sent to the candidate and client |
| Interview mode | Needed now, pre-filled | Same |
| Link or address | Should be asked for when mode is video or in person | It is the only way the candidate learns where to go |
| Interviewer | Optional, keep | Shown to the client |
| Invite: team | Needed now | Pre-chosen when the manager has one team |
| Invite: name | Needed once only (P6) | Staff record |
| Invite: work email | Needed now | Sign-in identity |
| WhatsApp number, "Use this number" | Needed only when turned on | Sender for candidate messages |
| Change password and two-step fields | Needed now | Security. Leave as is |

Nothing in this workflow can be "read from the CV": the recruiter types no candidate details. The saving here comes from showing what is already known, not from removing fields.

---

## 4. What to leave alone, and why

1. **The shortlist of three with no scores.** It stops browsing and bulk copying of the candidate list, and it is tested. Fix the blocked places (R3, F7.16), not the size.
2. **One click per candidate to see phone and email, the daily limits, and the record of each view.** This is the main protection of candidates' personal data against a departing recruiter. Make it tappable and show the count (P10, P11), nothing more.
3. **The consent rule before submission.** A candidate without sharing consent must stay un-submittable. The fix is a way to record consent with how it was given, never a way round it.
4. **WhatsApp only with the candidate's consent.** The recruiter's messages already respect this: all 73 messages in the test queue were skipped, none queued, and the code marks a message "no WhatsApp consent from the candidate" when the tick is missing. This matches the owner's decision. Two gaps to note:
   - No test covers this for recruiter-triggered messages (only for the website forms). Add one before a WhatsApp provider is connected.
   - The recruiter is not told a candidate has no WhatsApp consent, so they may assume the message went.
5. **The required reason on Not selected, Withdrawn, Offer declined and Did not join, and the rule that the candidate is never told the reason.** Tested (F8.28, F8.32).
6. **The required note on submission.** It is the recruiter's product for the client.
7. **Stage order (no skipping) and the "someone else updated this" protection.** Tested (F8.8).
8. **Team scoping: a recruiter sees only their team, and "not found" for everything else.** Tested (F4.9, F7.3, isolation tests).
9. **The confirm box on "Remove from team" and the clearing of that person's jobs.**
10. **The commitment text the candidate accepts ("stay at least 60 days", "no fee or penalty").** It is a consent record with a version, not a marketing claim, so the owner's decision to keep the 60-day replacement off candidate-facing proof strips does not apply to it. The only open point is the audit's R10 (it says 60 days for every client).
11. **The warning "Left a previous placement within the 60-day guarantee" on the recruiter's card.** Staff only, never shown to candidates or clients.
12. **Sign-in, the rate limit, the password rules and optional two-step sign-in.** Short and tested.
13. **Forgot password through an administrator.** Acceptable until staff email is set up; the page explains it clearly.

---

## Where (for the developer)

- Recruiting screen: `app/platform/recruiting/recruiting.tsx` (top message line, job card, assign list, commitment link button, pass form, note box, `when()` time format).
- Recruiting actions: `app/api/platform/recruiting/[action]/route.ts` (team-invite refusal for an existing email; `pass` already accepts `note`).
- Rules: `lib/portal/staff.ts` (`staffWork` job columns, `assignJobRecruiter` membership-only check, `staffPass`, `CONTACT_VIEWS_PER_DAY`, `PASSES_PER_DAY`), `lib/portal/commitment.ts` (`reissueCommitmentLink` has no stage check), `lib/portal/notify.ts` (`notifyCandidate` WhatsApp consent check), `lib/portal/client.ts` (`moveStage`, `scheduleInterview`).
- Sign-in, account and invitation: `app/platform/forms.tsx` (`SetPasswordForm` name box), `app/platform/accept/page.tsx`, `app/api/platform/auth/accept/route.ts`, `app/platform/page.tsx` (dashboard), `app/platform/shell.tsx` (menu highlight).
- Database columns relied on: `pipeline.recruiter_note`, `pipeline.stage_reason`, `pipeline.offer_ctc_inr`, `pipeline.joining_date`, `pipeline.last_working_day`, `pipeline.competing_offers`, `shortlist_passes.reason` and `.note`, `jds.recruiter_id`, `candidate_commitments.token_hash` and `.accepted_at`, `candidates.whatsapp_consent_at`, `messaging_settings`, `audit_events` (action `contact_view`).
- Existing checks named above: `scripts/audit/functional.mjs` (F1.3, F4.9, F7.x, F8.x, F9.x, F14.8), `scripts/audit/uat.mjs`, `scripts/audit/quality.mjs`, `tests/access-control.test.mjs`, `tests/isolation.test.mjs`.
- Review scripts and screenshots: `/tmp/claude-0/-home-user-jobpoint/690e6742-d2a5-5a98-9fca-8ffd0605a83d/scratchpad/rec/`
