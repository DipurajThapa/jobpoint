# Deployed end-to-end test (investor condition 2)

Run this on the **live** site after each republish. Use only fictional people (names starting "LIVE CHECK", addresses @example.com, except the email test, which goes to an inbox you own). Record the date, the result and a screenshot or reference for each step. When you finish, complete the deletion request so the records are erased.

## Part A: automatic (5 minutes)

```
node scripts/live-check.mjs https://<live site>
```

This checks that pages load and links navigate, files an employer enquiry (and checks its acknowledgement email), files a CV registration and its duplicate, files a deletion request, and confirms that private APIs refuse anonymous visitors and that cross-site posts are refused. The report is written to `docs/pilot/LIVE_CHECK_<date>.md`.

## Part B: signed in, by a person (about 45 minutes)

| # | Step | Who | Pass when | Result |
|---|---|---|---|---|
| B1 | Email: owner console → Pilot and investor → Send test, to your own inbox | Owner | The email arrives, and the log says `sent` | |
| B2 | Failed email: send a test to `nobody@invalid.invalid` | Owner | The log shows the failure and the reason | |
| B3 | Turn the Part A enquiry into a client (Create client from this enquiry), with a test owner email you can read | Owner | The client is created, and the sign-in link arrives by email | |
| B4 | Record the signed mandate and the vacancy authorisation, then publish one role for that client | Owner | The role appears on the site. A role without authorisation is refused with the reason | |
| B5 | Apply to that role as a fictional candidate (tick "share my CV with this employer") | Visitor | Reference given; acknowledgement email sent | |
| B6 | Recruiting tool: open the job, read the profile and CV, show phone and email, submit with a note | Recruiter | The client sees the candidate; the candidate's inbox and email say "put forward" | |
| B7 | Wrong-client access: signed in as a different client, open the first client's candidate profile URL | Other client | Refused (403 or 404) | |
| B8 | Client: shortlist, schedule an interview, reschedule it, cancel it, schedule again | Client | The candidate gets one message per change; the recruiter's "What changed" shows each | |
| B9 | Record the interview result as Jobboard300 on the client's behalf; client makes an offer; candidate accepts the commitment link | Recruiter, client, candidate | Each step reaches the right inbox and email | |
| B10 | Joined, with the salary → placement with fee; record invoice and payment | Client, owner | The Pilot page shows the fee, collection and contribution | |
| B11 | Log recruiter time on the job | Recruiter | Hours appear in the weekly funnel and the unit economics | |
| B12 | Duplicate application: apply again with the same email within 24 hours | Visitor | Refused as a duplicate | |
| B13 | Deletion: the candidate deletes their account (or the owner completes the Part A deletion request) | Candidate, owner | The person's email is gone from every list; the client is told | |
| B14 | Closure: close the job | Client | Remaining candidates are told "position closed"; the job stays visible as closed | |

Keep this table filled in. It is the evidence for the investor's condition "a successful end-to-end test on the deployed product".
