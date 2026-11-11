# Jobboard300 audit report

10 November 2026. Tested on the code of branch `claude/kind-turing-1olzbi` (same as `main` at commit `7ed2066`), running locally with an empty database.

## Status, 11 November 2026: the open items are fixed

A later run of the same three auditors after the fixes below: **481 checks, 481 passed, 0 findings** ([RESULTS_2026-11-11.md](RESULTS_2026-11-11.md)). Before the fixes the same run had 477 checks and 44 findings. Every reference below is now a passing check, or an auditor step that exercises the new behaviour.

| Group in section 6 | References | Where it is fixed |
|---|---|---|
| Interviews | F8.18, F8.24, F8.25, F8.26, F8.27 | `lib/portal/client.ts` (`scheduleInterview`, `rescheduleInterview`, `recordInterview`); staff versions in `lib/portal/staff.ts`; both screens |
| Filling, closing, editing a job | F9.19, F9.20, F13.1, F13.2, F13.5 | `lib/portal/client.ts` (`jobFilledCheck`, `closeOpenCandidates`, `closeJob`), `lib/portal/company.ts` (`updateJdRequirements`), `lib/portal/vacancy.ts` (`closeVacancy`) |
| Salary, fee, replacement | F10.3b, F10.8 | `moveStage` (salary required for Joined; replacement linked, no new fee), `reportPlacementExit` (job re-opens), owner `placement-edit` |
| Consent | F12.0, F12.4, F12.5 | `lib/portal/consent.ts` (`withdrawFromCompany`, history on withdrawal), `submitByRecruiter` |
| Nobody left in the dark | F4.11, F8.35, F9.7a, U9.8a, F11.19 | `lib/portal/notify.ts` (`notifyStaff`, message `link`), `lib/portal/commitment.ts`, `lib/portal/adaptive.ts`; candidate inbox shows buttons |
| The recruiter does the whole job in one place | U7.5, U7.7, U7.8, U8.9a, F9.13, F9.4a, F11.12, F7.16, F10.4, U9.3a | `app/platform/recruiting/recruiting.tsx`, `lib/portal/staff.ts`, `lib/portal/views.ts` |
| Owner console | U2.2, U2.4a, U2.5, U6.5, F14.8, F6.5, F4.7a | `app/admin/*`, `app/api/admin/portal/[action]/route.ts`, `app/api/platform/admin/*` |
| Sign-in, wording | F14.7, U5.3, U8.5, U11.8 (two pages), Q.stale.rules, Q.stale.unlock | `app/portal/*`, `app/candidate/candidate-app.tsx`, `app/company/company-app.tsx`, `lib/portal/accounts.ts` |

Not code, and still open: the business and legal items in GitHub issue 1 (registered entity, grievance contact, processor agreements, retention approval, verified vacancies), email delivery (the mail provider keys must be set on the live site, then sent as a test), and the live-site checks in section 7. One fix changed an auditor's expectation rather than the product: a filled or closed job now stays visible to recruiters under a “closed” filter instead of disappearing (F13.6).

## 1. Verdict

**The core hiring workflow works and the data is stored and kept apart correctly. The product is not ready to run a live recruitment desk yet, because people are not told what happens and several workflows have no ending.**

Three auditors ran 450 checks. 445 passed. They raised 53 findings: 2 blockers, 23 high, 18 medium and 10 low. A separate reading of the code and the screenshots added 29 more that the auditors have not exercised yet.

What decides the verdict:

1. **Nobody outside Jobboard300 is ever sent anything.** Every update (put forward, interview time and link, offer, commitment link, not selected) is written to an inbox inside the portal. No email is sent. A person who applied on the website has no portal account, so they hear nothing after the reference number on the screen. (U9.9)
2. **Website applicants and newly published roles do not reach the recruiter** until the owner opens the console and presses "Run scoring now". (F5.20)
3. **The privacy notice, the terms and the compliance page say the site is a read-only demo that collects nothing.** Live intake has been on since 9 November. These are the notices people agree to when they send a CV. (Q.stale.demo)
4. **Recruiters cannot do their job from the Recruiting tool alone.** They cannot open a CV, cannot get the phone number once a candidate is submitted, cannot see the client's interview feedback, cannot record or reschedule an interview, and are never notified of anything a client does. (U7.5, U7.7, U8.9a, F8.24, F8.25, F8.35)
5. **Workflows have no ending.** A filled job stays live. A closed job strands its candidates. An exit inside the guarantee creates no replacement task. A placement can be recorded with no fee. (F9.19, F13.5, F10.8, F10.3b)

What is sound, and was tested hard:

- Every entry is stored with the values typed, and each role reads back only what it should. One client cannot see another client's jobs or candidates. A recruiter outside a client's team sees nothing of it. A visitor reaches no private page or API.
- The client does not get a candidate's phone or email before an offer. Interview feedback, ratings, rejection reasons and test levels never reach the candidate, and test levels never reach the client.
- Deleting a candidate account, and a verified deletion request for a website applicant, remove the person's email from every table in the database.
- All internal links lead to pages that exist. Every button that was pressed does something. No page failed to load and no server error occurred in any run.

## 2. What was built

Three auditors, each a script that can be run again at any time, and each defined as a Claude Code agent in `.claude/agents/`.

| Auditor | What it does | Script | Agent |
|---|---|---|---|
| Functional | Makes every kind of entry through the same API the screens use, then reads the database to check the row, then checks who can and cannot read it back. Walks the hiring workflow and every way out of it. | `scripts/audit/functional.mjs` | `functional-auditor` |
| Quality | Starts at the home page and opens every page and screen, as a visitor and as each signed-in role. Follows every link, presses every safe button, checks for errors, phone-width layout and outdated wording. | `scripts/audit/quality.mjs` | `quality-auditor` |
| UAT | Plays each person's part in a real browser, typing into the real forms: employer, owner, client, candidate, recruiter, administrator. One story from an enquiry to a hire, then the "not selected" branch. | `scripts/audit/uat.mjs` | `uat-auditor` |

To run them again, start the site locally and run the audit:

```bash
npm run dev
```

```bash
npm run audit
```

The audit resets the local database, runs all three and writes `docs/audit/RESULTS_<date>.md`. Each finding in section 5 has a reference such as F9.19. The same reference is in [RESULTS_2026-11-10.md](RESULTS_2026-11-10.md), with the full evidence and the file to change. When a fix is made, run the audit again: a fixed defect turns into a passing check, and the finding disappears from the results.

The auditors run only against a local copy. They create and delete records, so they refuse any other address. Everything they create is fictional.

## 3. What was tested

| | Functional | Quality | UAT |
|---|---|---|---|
| Checks | 186 | 204 | 60 |
| Passed | 185 | 203 | 57 |
| Findings | 29 | 6 | 18 |

The quality auditor opened 40 pages and screens, followed 31 different internal links and saw 232 buttons. It pressed those that are safe to press and recorded the rest, which the other two auditors use.

Three reviewers also read the code for each area (public site and owner console, candidate and client portal, staff platform) without running it. Where they found something the auditors had not tested, a check was added and the claim was confirmed or dropped. What remains from the reading alone is listed in section 5 and marked "code review".

### What works, by workflow

| Workflow | Result |
|---|---|
| Employer enquiry → owner console | Works. Stored as typed, reference shown, status changes saved. |
| Enquiry → client → client signs in | Works. One-time link, used once only. Terms stored. |
| Client posts a job → approval → recruiter | Works. Requirements read from the text. Other clients and other teams cannot see it. |
| Candidate: portal sign-up, verify, CV upload, corrections | Works. CV read into a profile, consents recorded one by one, corrections kept. |
| Website application with CV | Stored correctly; owner downloads the same file. **Does not reach the recruiter without "Run scoring now" (F5.20).** |
| Recruiter: shortlist of three, contact, pass, submit | Works, with the gaps in section 5C. |
| Client: review, profile, CV download, shortlist | Works. Contact details held back until offer. |
| Interviews: several rounds, by client or recruiter, feedback | Scheduling and feedback work. Lifecycle gaps in section 5D. |
| Offer → commitment → offer accepted → joined → placement | Works. Fee, guarantee end and non-solicitation date computed correctly when a salary was entered. |
| Not selected, withdrawn, offer declined, did not join | Work. A reason is required and stored. The client loses the name, note and CV. |
| Exit inside the guarantee | Recorded. Nothing follows from it (F10.8). |
| Consent withdrawn, account deleted, verified deletion request | Work, and reach every screen. |
| Fast Track order, payment confirmed, technical test, invited test by link | Work. Two defects on the screens (U12.4, F11.12). |
| Team members, sign-out, wrong password, forgotten password | Work. |

## 4. The hiring workflow as it works today

This is what the product does now. The functional auditor confirmed each step; the last column gives the reference where something is missing.

| Step | Who can do it | What is stored | Who is told (inbox only) | What is missing |
|---|---|---|---|---|
| Submit a candidate to a client's job | Recruiter (only someone on their shortlist of three), administrator | Pipeline entry at "Submitted", recruiter's note, who submitted | Candidate, client | — |
| Shortlist | Client, recruiter | Stage, history | Candidate; client if staff did it | Recruiter is not told when the client does it |
| Schedule an interview (any number of rounds) | Client, recruiter | Round, time, mode, link or address, interviewer. First one moves the stage to "Interviewing". | Candidate (time in India time, link); client if staff did it | A past date is accepted (F8.18). No reschedule (F8.25). |
| Record the interview | **Client only** | Completed, cancelled or no-show; outcome; rating; feedback | Nobody | Staff cannot record it (F8.24). Candidate is not told of a cancellation (F8.26). "Do not proceed" does not move the candidate (F8.27). |
| Offer | Client, recruiter | Stage, salary (optional), offer date. Creates the candidate's commitment. | Candidate (offer, commitment link) | Salary is optional (F10.3b). |
| Contact details to the client | Automatic from "Offer made" | — | — | Client sees the CV's contact details, recruiter sees the record's (F9.4a). |
| Commitment | Candidate, from a one-time link | Acceptance time | Nobody | Link points at one fixed address (F11.19). Re-issuing breaks the first link (F9.7a). |
| Offer accepted | Client, recruiter | Expected joining date, last working day, other offers | Candidate | Recruiter's form lacks two of the fields; no joining list for the recruiter (F9.13). |
| **Selected: joined** | Client, recruiter | Placement: joining date, salary, fee, guarantee end, non-solicitation date | Candidate | Job stays live (F9.19). Other candidates stay in process (F9.20). |
| **Not selected** (from Submitted, Shortlisted or Interviewing) | Client, recruiter | Stage, reason code and note. Scheduled interviews cancelled. | Candidate: "the employer has decided not to take your application further". Never the reason. | Client cannot undo a mis-click; staff can re-open to "Shortlisted". |
| Withdrawn (from Shortlisted, Interviewing, Offer made) | Client, recruiter | Stage, reason | Candidate | Not possible from "Submitted" (F10.4). |
| Offer declined, did not join | Client, recruiter | Stage, reason. No placement. | Candidate | These are final: the person cannot be submitted to that job again. |
| Left after joining | Client | Placement becomes "left in guarantee" or "left" | Nobody | No replacement task, no link to a replacement hire (F10.8). |
| Candidate withdraws consent | Candidate | All open entries closed as "Withdrawn (consent withdrawn)", interviews cancelled, client access ended | Client's users (by email, when email is set up) | No history row (F12.4). Cannot be submitted to that client again even after allowing sharing again (F12.5). |

## 5. Findings

Severity: **Blocker** stops a real workflow. **High** will cause wrong outcomes or lost work in normal use. **Medium** costs time or confuses. **Low** is cosmetic or minor.

"Run" in the Source column means an auditor confirmed it and the evidence is in the results file under that reference. "Code review" means it was found by reading the code and has not been exercised by an auditor yet; the file is given so it can be checked.

### 5A. People are not told what happens

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| U9.9 | Blocker | No email is sent to a candidate or a client for any update. Website applicants, who have no account, hear nothing at all. WhatsApp messages are queued but no provider is connected. | Send each inbox message by email as well (`lib/portal/notify.ts`), to the address on the person's record. Set the mail keys and send one test message. | Run |
| F8.35 | Medium | Recruiters get no notice of anything a client does: shortlist, reject, interview, feedback, offer, exit. They must open each job to find out. | Add a "What changed" list in the Recruiting tool, fed by the same events. | Run |
| F8.26 | High | When an interview is cancelled the candidate is not told. Their inbox still shows the interview. | Send "your interview on … has been cancelled" from `recordInterview()`. | Run |
| F4.11 | Medium | The client is not told when their job is approved or sent back. | Send a client notice from `decideJd()`. | Run |
| F9.7a | Medium | "Get a new link" for the commitment silently breaks the link already in the candidate's inbox. | Send the new link to the inbox as well. | Run |
| U9.8a | Medium | Links in the candidate's inbox (commitment, test, interview) are plain text and cannot be clicked. | Render links as links, or add an "Open" button. | Run |
| F6.5 | Low | A privacy request gives the person no reference number. | Return and show a `PR-…` reference. | Run |
| R1 | High | When the owner erases a person, deletes an application or withdraws their consents, clients who hold that CV are not told to delete their copy. (When the candidate deletes their own account, clients are told.) | Call `notifyCompanies()` in the three owner paths. `app/api/admin/privacy-requests/[id]/route.ts`, `app/api/admin/records/[type]/[id]/route.ts` | Code review |
| R2 | Medium | Cancelling a Fast Track order sends the candidate nothing. Accepting the commitment tells nobody. | Notify in `decideFastTrackOrder()` and `acceptCommitment()`. | Code review |

### 5B. Candidates do not reach the recruiter, or cannot be put forward

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| F5.20 | Blocker | A website application, and a role published from the owner console, only join a scoring queue. Nothing runs the queue. The recruiter sees "No more candidates for this job right now" until the owner presses "Run scoring now" or some portal candidate uploads a CV. | Run the queue at the end of the application request and of the role save, and as a fallback when a recruiter opens a job. | Run |
| F12.5 | High | A candidate who turned sharing off once can never be submitted to that client again, even after turning it back on. The recruiter finds out only on pressing Submit. | Clear the old revocation when consent is active again, or show it on the card and hide Submit. | Run |
| R3 | High | A website applicant who did not tick "share my CV" can never be submitted. The screen says "Ask them first; record their consent before submitting", but no screen records consent. | Add an owner or recruiter action that records consent with a note of how it was given. `app/admin/portal-panel.tsx`, `app/api/admin/portal/[action]/route.ts` | Code review |
| F7.16 | Medium | A pass cannot be undone. One wrong click hides the candidate from every recruiter on that job. | Add "Reconsider" for a manager or administrator, and a confirm on Pass. | Run |
| F10.4 | Medium | A candidate who has just been submitted cannot be recorded as withdrawn. The only choices are "Shortlisted" or "Not selected", which pollutes the rejection reasons. | Allow "Withdrawn" from "Submitted" and from "Offer accepted". | Run |
| R4 | Medium | The recruiter's card does not show that a person applied to this very role, although the server knows. | Show an "Applied to this role" label. `app/platform/recruiting/recruiting.tsx` | Code review |

### 5C. The Recruiting tool is missing what recruiters need

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| U7.5 | High | A recruiter cannot open a CV or profile anywhere. They see a name, a city and one line, and must write a recommendation for the client from that. | Add "View CV" on each shortlisted candidate and pipeline row, recorded in the access log. | Run |
| U7.7 | High | Once a candidate is submitted, the recruiter can no longer open their phone or email. The button exists only on the shortlist. | Add "Show phone and email" to every pipeline row. | Run |
| U8.9a | High | The client's interview feedback, rating, the meeting link and the interviewer are sent to the recruiter's screen but not displayed. | Show them under each interview. | Run |
| F8.24 | High | Staff cannot record an interview's outcome, a cancellation or a no-show. Only the client can. | Add "Record outcome" for staff, marked as recorded by Jobboard300. | Run |
| F9.13 | Medium | The joining follow-up calls (30, 14, 7 and 1 day before) are listed for the client, who is told "Jobboard300 can do this for you". The recruiter has no such list. | Add a "Joining soon" list to the Recruiting tool. | Run |
| F11.12 | Medium | A Fast Track candidate's technical test result is never shown to recruiters, only a "Fast Track" label. | Show valid results on the card and the pipeline row. | Run |
| U9.3a | Medium | One-time links appear as plain text in the status line and are wiped by the next action. A lost test link cannot be issued again. | Use a link box with a Copy button; allow re-issue. | Run |
| U7.8 | Low | The recruiter's own note, the offer and the joining date are not shown back in the pipeline. | Display them. | Run |
| U6.5 | Medium | The owner console says "work the candidates in the Recruiting tool" in three places and has no link to it. | Add the link. | Run |
| R5 | Medium | Client invitation, job approval, fee terms, placements and "Run scoring now" exist only in the owner console. An administrator can open the console only with two-step sign-in on, and nothing says so. Setting up one recruiter takes three screens. | Add an "Owner console" entry for administrators with a hint; link the three screens. `app/platform/shell.tsx` | Code review |
| R29 | Medium | Recruiters are meant to see candidates without scores, but the summary line under each name begins with the score and its range ("92 (likely 86–97): meets 5 of 5…"). Seen on the recruiter's screen in the UAT screenshots. | Remove the score from the summary for anyone but an administrator. `lib/portal/staff.ts`. Check F7.2b was added to the functional auditor after the last run and will report this from the next run. | Screenshot |
| R6 | Low | The aptitude-test tick box is shown to recruiters, but the server refuses them. "Send a test" and "Update stage" are offered on closed entries. The submit form shows on jobs that are not live. | Hide controls the person cannot use. `app/platform/recruiting/recruiting.tsx` | Code review |

### 5D. Interviews

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| F8.25 | High | An interview cannot be rescheduled. The only way is to cancel it and create another. | Add reschedule for client and staff, with one message to the candidate. | Run |
| F8.27 | High | Recording "Do not proceed" leaves the candidate at "Interviewing" with later rounds still scheduled. The decision has to be entered a second time. | Offer "Move to Not selected" (with the reason) in the same step. Offer the next step after "Move forward". | Run |
| F8.18 | Medium | An interview can be scheduled in the past; the candidate is messaged about it. | Refuse past times. | Run |
| R7 | Medium | The client's profile screen says "Jobboard300 arranges every interview with this candidate", while the client schedules interviews directly. | Decide which is true and make the screen and the wording agree. `app/company/company-app.tsx` | Code review |

### 5E. Jobs: filling, editing, closing

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| F9.19 | High | A job with one opening stays live after someone joins. Recruiters can keep submitting, and a public role keeps taking applications. | When joined equals openings, mark the job filled, stop submissions and take the listing down. | Run |
| F9.20 | Medium | The other candidates on a filled job stay "in process" for ever and are not told. | Offer one action: close the rest as "Not selected (position filled)". | Run |
| F13.5 | High | Closing a job leaves its candidates in open stages, tells nobody, removes the job from the recruiter's list, and cannot be undone. The client's "Profile" button then fails. | On close, close each open candidate as "Withdrawn (position closed)" with a message. Keep closed jobs visible under a filter. Allow re-opening. | Run |
| F13.1 | High | Pressing "Save changes" on a live job, with nothing changed, takes it offline as a draft. It leaves the recruiter's list with its candidates, and needs two more steps to return. | Do nothing when nothing changed. Send a real change straight to "waiting for approval". Keep jobs with open candidates visible to staff. | Run |
| F13.2 | High | Saving the job editor erases details it does not show: location, work mode, seniority, education fields. Matching changes as a result. | Merge the form over the stored requirements instead of replacing them. | Run |
| R8 | Medium | A published role cannot be edited, previewed or marked "featured". A typo cannot be fixed. | Add an edit form and a "View on site" link. `app/api/admin/jobs/[id]/route.ts`, `app/admin/admin-client.tsx` | Code review |
| R9 | Medium | The number of openings cannot be changed after a job is created; the server supports it but no screen does. | Add the field to the job editor. `app/company/company-app.tsx` | Code review |

### 5F. Placements and the fee

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| F10.3b | High | The offered salary is optional. A candidate can be marked joined with no salary, which records a placement with no fee. No screen can correct a placement's salary or fee. | Require the salary before "Joined". Add an owner action to correct salary and fee with a reason. | Run |
| F10.8 | High | An exit inside the guarantee is recorded and the client is told "Jobboard300 will contact you about a replacement". The recruiter sees nothing, the job is not re-opened, and a replacement hire is not linked and is charged a fee again. | Create a replacement task for the team, link the new hire to the old placement, and set its fee as the contract says. | Run |
| R10 | Medium | The commitment text says "60 days" for every client, while each client's guarantee is set between 0 and 365 days. | Use the client's own period. `lib/portal/commitment.ts` | Code review |
| R11 | Medium | Placements, fees and guarantee dates are not visible anywhere in the Working Platform. A mistaken "Joined" cannot be undone. | Add a placements list for managers and administrators, and a confirm on "Joined". | Code review |

### 5G. Privacy, consent and safety

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| Q.stale.demo | High | The privacy notice, the terms and the compliance page say the site is a read-only demo and that submissions are disabled. Live intake is on. | Rewrite these pages for live intake before more CVs are collected. `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/compliance/page.tsx` | Run |
| Q.forms.noscript | High | Four portal forms (sign-in, registration, password reset, set password) have no method of their own. If the button is pressed before the page's script has loaded, the password goes into the address bar, the browser history and the server logs. This happened during the UAT run. The staff sign-in and two-step sign-in forms are safe; the staff set-password forms could not be checked without a valid link. | Give the forms `method="post"` and a working action, or keep the button disabled until the script is ready. `app/portal/forms.tsx` | Run |
| F12.0 | High | "Hide my profile from this employer" does not take the profile away from an employer who already has it. | End that employer's access and close the open entry, or say plainly that it applies only from now on. | Run |
| U13.1 | High | "Delete my account" sends the candidate to the sign-in page even when the wrong word was typed and nothing was deleted. | Leave the page only after a successful deletion. | Run |
| F11.19 | High | Test and commitment links always use one fixed address written in the code. On any other address (a custom domain, a preview) they lead to the wrong site. | Build links from the site that issued them, or from a setting. `lib/site.ts` | Run |
| F14.8 | High | Removing a recruiter from a team in Operations leaves their jobs assigned to them and hidden from the rest of the team. | Clear the assignments, as the Recruiting tool's own "Remove" already does. | Run |
| U5.3 | Medium | A candidate with no CV yet cannot download or delete their data. | Always show "Your data". | Run |
| F14.7 | Medium | A suspended client can still sign in and is bounced between sign-in and the workspace with no explanation. | Show "This company account is not active" and end the session. | Run |
| F9.4a | Medium | At offer, the client is shown the contact details printed in the CV; the recruiter is shown the ones on the person's record. They can differ, or the client's can be blank. | Use the record's details for both. | Run |
| F12.4 | Low | A consent withdrawal closes pipeline entries without writing the history. | Write the history row. | Run |
| R12 | Medium | The consent wording candidates agree to still describes the removed design (an anonymous summary shown automatically, a company "unlocking" the profile). The watermark on every CV a client downloads says "Unlocked by …". | Have the wording reviewed and reissued as a new version. `lib/portal/notice.ts`, `lib/portal/watermark.ts` | Code review |
| R13 | Medium | The privacy notice describes a "screening tool" tab that was removed, says "there is no candidate account", and says only the owner has access. | Rewrite with the pages in Q.stale.demo. `app/privacy/page.tsx` | Code review |
| R14 | Medium | The general terms say the website does not "publish an approved fee schedule". The home page, the employers page and the employer terms publish 7.5% to 8.33%. | Align `/terms` with `/terms/employers`. | Code review |
| R15 | Medium | A staff password-reset link signs the person in without the second step, for an account with two-step sign-in on. The administrator's "reset two-step sign-in" exists on the server with no button. | Send the person to sign-in after a reset. Add the button to Team access. `app/api/platform/auth/accept/route.ts` | Code review |
| R16 | Medium | "Withdraw optional consents" in the owner console also closes every open pipeline entry, cancels interviews and deletes matches. The confirmation mentions none of this, and it cannot be undone. | Say so in the confirmation. `app/admin/admin-client.tsx` | Code review |
| R17 | Low | The candidate can give consent to service offers at upload but has no way to withdraw it on screen. A deletion request can be marked completed without erasing. Erasure does not cover the person's employer enquiries. | Add the switch; warn on completing without erasing; include enquiries. | Code review |

### 5H. Finding the way in and around

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| Q.visitor.portal-link | High | No public page links to the candidate or client sign-in. People must keep the address from their invitation. | Add "Sign in" to the header and footer. | Run |
| Q.visitor.recruiter-link | Medium | "Recruiter sign-in" in the footer goes to the owner-only console. Recruiters sign in at `/platform/sign-in`. | Point the link there. | Run |
| U2.2 | Medium | An enquiry cannot be turned into a client from its card. The owner retypes the company, name and email in another tab, then comes back to link them. | Add "Create client from this enquiry", prefilled. | Run |
| U6.4 | Medium | The owner cannot find an application by the reference the applicant was told to keep. Enquiries have no search. | Search by `JP-…` and `HE-…`. | Run |
| U11.8 | Low | "Create account" and "Forgot password" have no link back to sign-in; the logo is not a link. | Add the links. | Run |
| U8.5 | Low | "Back to dashboard" on the candidate profile goes to the pipeline. | Rename it and keep the job filter. | Run |
| U2.4a | Low | A client created a moment ago is missing from the console's lists until the page is reloaded. | Refresh the lists after the action. | Run |
| R18 | Medium | "Contact Jobboard300" and "Talk to a recruiter" open the employer hiring form. A job seeker with a question has no channel: no email, phone or address is published. | Add a contact form or contact details. `app/home-client.tsx` | Code review |
| R19 | Medium | The site says "Tell us your skills, experience, expected salary and notice period". The form has no salary or notice field. The form's "message" is read by the server but has no input. | Add the fields or change the wording. `components/candidate-fields.tsx` | Code review |
| R20 | Low | The sector tiles on the home page look like links and do nothing. "Search jobs" does not react to Enter. | Make them filter the job list. `app/home-client.tsx` | Code review |

### 5I. Owner console

| Ref | Severity | What happens today | What to change | Source |
|---|---|---|---|---|
| U2.5 | High | "Change parameters" opens a blank form. Saving it replaces the client's rules with the defaults and can pause live jobs. | Show the current values in the form. | Run |
| R21 | Medium | The Job portal tab goes blank if its data fails to load (for example after the session expires). The console shows "No roles have been added" and "No privacy requests have been received" while loading and after a failed load. | Check the response and show "Could not load" with a retry. `app/admin/portal-panel.tsx`, `app/admin/admin-client.tsx` | Code review |
| R22 | Medium | "Client this role is for" offers clients that are not active; saving then fails. | Use the active list the server already returns. `app/admin/admin-client.tsx` | Code review |
| R23 | Low | "Access history" lists changes, not access, without who did them, and the times are 5.5 hours off in India. The house client "Jobboard300" can be suspended, which breaks every role without a client. Failed CV downloads show a raw error page. | Rename and add the actor; fix the time; hide Suspend for the house client; show errors on the page. | Code review |

### 5J. Outdated wording on the screens

| Ref | Severity | Where it appears | Source |
|---|---|---|---|
| Q.stale.unlock | Low | Owner console → Job portal, "Candidates shared with clients" lists raw "unlock" and "release" events. Candidate page consent text says "If the company unlocks your profile". | Run |
| Q.stale.summary | Low | Candidate page: "Jobboard300 shares an anonymous summary with the employer", "matching employers can see your anonymous summary", "No employer has unlocked your full CV". | Run |
| F4.7a | Low | Approving a job answers "Matching CVs will be released automatically." | Run |
| R24 | Low | Client pages: "sets the rules for which CVs you receive", "approve it against your matching rules", a "Self-service" label and "strong match(es)" in the code path. Registration form: "never contacting candidates outside Jobboard300 before unlocking". Error texts: "Unlock this profile before adding it to your pipeline". Owner form: "Maximum CVs released per job" (never enforced). | Code review |
| R25 | Low | Documents: `docs/PORTAL.md` tells the reader to run `npm run check:portal-e2e`, which does not exist, and still documents plans and payments that were removed. `docs/WORKING_PLATFORM_ADMIN_GUIDE.md` covers Email Kit only. | Code review |

### 5K. Smaller defects

| Ref | Severity | What happens today | Source |
|---|---|---|---|
| U12.4 | High | After a candidate finishes a test in the portal, the page calls the server in an endless loop until they leave. Fix in `app/candidate/candidate-app.tsx` (the test screen reloads itself each time it reports "done"). | Run |
| R26 | Medium | The test clock uses the candidate's device time. If that clock is ahead, the last minutes reload every second and clear the chosen answer. `components/test-runner.tsx` | Code review |
| R27 | Low | Public forms show a raw technical message if the server's answer is not readable. Success and error messages look the same. The approve and change-parameters forms close even when saving failed, losing what was typed. | Code review |
| R28 | Low | A CV file with a very long name can fail to download for the client, because the type is read from the shortened name. DOCX upload may be refused on Windows machines that report no file type. Both need a real-device check. | Code review |

## 6. The order to fix things in

Each group can ship on its own. After each one, run `npm run audit`: the references named should no longer appear in the results.

### Group 1: before any more live CVs are taken

These are short changes and each removes a real risk today.

1. Rewrite the privacy notice, terms and compliance page for live intake, with the consent wording (Q.stale.demo, R12, R13, R14). This needs your lawyer's eye; it is the only item here that is not a code change alone.
2. Run the scoring queue when an application arrives and when a role is published (F5.20).
3. Give the portal forms a safe method (Q.forms.noscript).
4. Fix "Delete my account" (U13.1) and "Hide from this employer" (F12.0).
5. Build candidate links from the site's own address (F11.19).
6. Stop the endless loop on the test screen (U12.4).

### Group 2: nobody is left in the dark

7. Email every inbox message to candidates and clients (U9.9). Set up the mail keys and send a test.
8. Tell the candidate when an interview is cancelled (F8.26). Tell the client when a job is approved or sent back (F4.11).
9. Give recruiters a "What changed" list (F8.35).
10. Make inbox links clickable and keep re-issued links in step (U9.8a, F9.7a). Tell clients when a person they hold is erased (R1).

### Group 3: the recruiter can do the whole job in one place

11. View CV, and phone and email, on every candidate and pipeline row (U7.5, U7.7).
12. Show the client's feedback, the link and the interviewer (U8.9a). Record an outcome and reschedule from the Recruiting tool (F8.24, F8.25).
13. A "Joining soon" list and the two missing fields on the offer-accepted form (F9.13).
14. Link box with Copy for one-time links; show technical test results; show the recruiter's note (U9.3a, F11.12, U7.8).
15. Link the owner console and the Recruiting tool to each other (U6.5, R5).

### Group 4: every workflow has an ending

16. Job filled: mark it, stop submissions, close the rest with a message (F9.19, F9.20).
17. Job closed: close its candidates with a message, keep it visible, allow re-opening (F13.5).
18. Job edited: no change means no effect; a change goes to approval in one step; nothing is erased (F13.1, F13.2).
19. Salary required before "Joined"; owner can correct a placement (F10.3b). Replacement task and linked replacement hire (F10.8).
20. Interview outcome leads to the next step (F8.27). No past dates (F8.18).
21. Withdraw from "Submitted" (F10.4). Undo a pass (F7.16). Submit again after consent is given again (F12.5). Record consent for a website applicant (R3).
22. Removing someone from a team returns their jobs (F14.8).

### Group 5: finding the way in, and the owner console

23. "Sign in" on the public site; correct "Recruiter sign-in" (Q.visitor.portal-link, Q.visitor.recruiter-link).
24. Create a client from an enquiry; search by reference (U2.2, U6.4).
25. "Change parameters" shows the current rules (U2.5). Loading and error states in the console (R21, R22).
26. A suspended client is told so (F14.7). "Your data" always shown (U5.3). One source for contact details (F9.4a).
27. A way for a job seeker to ask a question; salary and notice fields on the form (R18, R19).

### Group 6: wording and tidying

28. Remove the outdated wording (section 5J).
29. The low items in sections 5H, 5I and 5K.

## 7. What was not tested, and why

- **The live site.** The auditors run only on a local copy. The real owner sign-in (through the hosting platform) cannot be reproduced locally; the local run signs the owner in automatically. What a recruiter or a client sees on opening `/admin` on the live site was read from the code, not run.
- **Email and WhatsApp delivery.** No mail key or WhatsApp provider is set up locally. The finding that no update is emailed comes from the database and the code: no email is ever queued for these events, whatever the settings.
- **Real CVs.** All CVs are fictional and typed. Scanned CVs, mixed Hindi and Bengali text and unusual layouts were not measured.
- **Email Kit.** It opens for an administrator. Its own buttons were not pressed here; it has its own end-to-end check (`npm run check:platform`).
- **Two-step sign-in** for staff, and an administrator opening the owner console with it on.
- **Load, speed and many users at once.**
- **Payments.** There is no payment gateway; Fast Track is confirmed by hand.
- **Phones.** Every public page was checked at 360 px for sideways scrolling and passed. The signed-in areas were not checked at phone width.
- Icons are loaded from Google Fonts. With that address unreachable, icon names show as words ("north_east"). The auditors block outside addresses, so their screenshots show this; a visitor sees it only if Google Fonts is blocked.
