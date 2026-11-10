# Jobboard300 data security

Who can see what, how the system stops information leaving without Jobboard300's
permission, and what to do if something goes wrong. Written for the owner and
the administrator. Technical detail is in `docs/PORTAL.md`.

## 1. Who can see what

| Person | Can see | Cannot see |
|---|---|---|
| Candidate | Their own CV, inbox, consents and which employers received their profile | Other candidates, the list of client companies, scores, interviewer feedback |
| Client company | Its own jobs and pipeline. A candidate's profile and CV **only while the hiring process for that person is open**. Contact details only from the offer stage | The candidate database, search, match counts, scores, rankings, matching rules, other clients |
| Recruiter | Clients and jobs of their own team | Other teams' clients, jobs and pipelines |
| Team manager | Their team's work and members; their team's WhatsApp set-up | Other teams; the admin's set-up |
| Administrator | Everything, with every change written to the audit log | |

## 2. Controls in place

**Client access is temporary.** A client reaches a candidate only through a
recruiter's submission. Access ends automatically when the candidate is
rejected, declines, does not join, withdraws, joins, or the job closes. The
pipeline then shows a reference code in place of the person's name.

**No direct contact before offer.** Until an offer is made, the client sees the
CV without email, phone or profile links, and the downloadable copy is a
re-rendered PDF with those removed. Jobboard300 arranges every interview.

**Every copy is traceable.** Each downloaded CV carries a visible watermark and
a trace code naming the company and the date. A leaked copy identifies its source.

**The selection method stays internal.** Clients never receive scores, rankings,
match counts, match reasons or the matching rules. A live job's requirements can
change at most three times in 30 days, and every change needs approval again, so
a client cannot learn how matching works by changing requirements and watching
the results. Further changes go through a recruiter.

**The client list is private.** Candidates hide from an employer by typing its
name. The system gives the same reply whether or not that employer is a client.

**Consent governs sharing.** A profile is shared only with the candidate's
recorded consent. Withdrawal closes every client's access at once and asks
clients to delete copies.

**Accounts.** Passwords are hashed. Sessions are HTTP-only cookies. Sign-in,
viewing and downloads are rate limited. Changes from another website are
refused. Staff tools need a named account and a per-tool permission.

**Logging.** Every profile view, download, submission and stage change is
recorded with who, what and when. Unusual browsing raises a flag for the admin.

## 3. Known gaps to close before scale

1. Two-step sign-in for administrators and team managers.
2. A written data processing agreement with each client, covering deletion of
   copies, no onward sharing and the non-solicitation period.
3. An outside security test before the client count grows.
4. Automatic alerts (email or WhatsApp to the owner) when an abuse flag is raised.
5. Regular export of the audit log to storage the application cannot change.

## 4. If a breach is suspected

A breach is any case where personal data may have reached someone who should
not have it: a leaked CV, a compromised account, a lost device, a wrong recipient.

**First hour: contain.**
1. Suspend the account or client involved (Admin → Companies → Suspend, or
   Working Platform → Team access → remove access). Access stops immediately.
2. If a staff account is involved, reset its password and sign it out everywhere.
3. If a secret may be exposed (`PORTAL_SECRET`, mail key), rotate it in hosting settings.
4. Do not delete anything. The logs are the evidence.

**First day: assess.**
1. From the access log and audit log, list which candidates' data was reached,
   by which account, from when to when.
2. If a leaked CV is in hand, read the trace code in its watermark to find the
   company and download date.
3. Decide whether the data could cause harm: contact details, salary, current
   employer and identity documents matter most.

**Within 72 hours: notify.** India's Digital Personal Data Protection Act
requires notice to the Data Protection Board and to each affected person. Confirm
the current form and deadline with your lawyer; the rules allow up to 72 hours
for the detailed report to the Board. Tell each affected candidate what
happened, what data was involved, what you have done and what they should do.

**Afterwards: fix and record.** Write down the cause, the fix and the date.
Close the gap in the product or the process, and add a test for it where possible.

Contacts to fill in: grievance officer, lawyer, hosting support, owner's phone.
