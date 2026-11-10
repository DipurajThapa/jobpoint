# Review of CV screening and filtering

11 November 2026. A critical reading of how Jobboard300 reads CVs, filters candidates and ranks them for a job: the code in `lib/portal/match.ts`, `lib/portal/queue.ts`, `lib/ats/` and `lib/portal/staff.ts`, the ranking report in `docs/verification/portal-ranking-2026-11-09.md`, and what the audit runs showed. I did not test with real CVs; none exist yet.

## Verdict

**The method is sound and appropriate for a recruitment consultancy. The numbers inside it are untested guesses, and three of its filters can wrongly remove good candidates.** It is safe to use as it is used today, as an ordering aid for a recruiter who makes every decision. It is not yet safe to trust the score itself, or to let a filter be the last word.

## How it works, in short

1. **Read.** Software reads each CV's text into work history, education, skills, city, notice period and salary. A CV with no text layer (a scan or a photo) goes to a manual review queue.
2. **Filter.** For each job, pass-or-fail rules: location, minimum years, essential skills, notice period, salary ceiling, and seniority bands.
3. **Score.** Candidates are scored out of 100 from weighted parts: must-have skills, relevant experience, job title, how recent the relevant work is, nice-to-have skills, education and location. The weights change with the job.
4. **Rank.** Candidates are ordered by a cautious version of the score (the score minus its uncertainty), with those who pass the filters first and those who applied to that very role ahead of others.
5. **Show.** A recruiter sees the best three at a time and must submit or pass with a reason. An administrator sees the top 40 with scores.

## What is right

- **Evidence counts more than keywords.** A skill shown in a job's description scores 1.0; the same skill only in a skills list scores 0.6, and less still when the list is long. Stuffing a CV with keywords does not pay.
- **Cautious ranking.** Thin evidence ranks below solid evidence at the same score. This is a recognised method and the right default.
- **Explainable.** Every score comes with what was met, what was missing and why. The same CV and job always give the same result.
- **Personal characteristics are left out.** Name, age, gender, religion, caste, marital status and photo are removed before scoring.
- **People decide.** Nothing is rejected automatically; a recruiter chooses whom to submit and the employer chooses whom to hire.
- **Local sense.** Nearby cities count as one labour market (Howrah and Kolkata), "A or B" requirements count once, and overlapping jobs are not double-counted as experience.

## What is wrong or risky

Ordered by how much it can cost you.

### 1. Nothing has been checked against real hiring (High)

The only test is 36 invented CVs against 5 invented jobs, graded by hand by the same work that built the engine. Every number that drives the result was chosen by judgement: the part weights, the 0.6 for a listed skill, the uncertainty figures, the 24-month recency rule, the pass marks. A score shown as "92 (likely 86 to 97)" looks measured and is not.

- **Consequence:** the order of candidates may be wrong in ways nobody has seen yet.
- **Fix:** treat the first 100 to 200 real submissions as the test. The system already records why a recruiter passed on someone and what happened to those submitted. Compare those outcomes with the scores each month and adjust the numbers. Until then, show recruiters the reasons and hide the precise figure (see 7).

### 2. "Not stated" was treated as "no" (High; location now fixed)

A filter should fail a candidate only on something known. Three did not:

- **Location.** A CV that named no city failed every job tied to a city. With the shorter website form, more candidates arrive without a typed city, so this would have removed many. **Fixed in this change:** an unknown city now passes, and only a known, different city fails.
- **Experience.** A CV without dates can come out as few or zero years and fail the minimum-years filter. Not fixed.
- **Essential skills.** The skill must be recognised in the CV. A candidate who has the skill but words it differently fails. Not fixed.

- **Fix:** for experience and essential skills, mark "not found" as a question for the recruiter ("ask about Tally") instead of a failure, unless the administrator has chosen the strict setting for that client.

### 3. Skills are recognised from a fixed list (High)

Skills are found by matching the CV text against a built-in dictionary, with exact-phrase matching for anything outside it. There is no understanding of meaning. "Accounts payable" and "vendor payments", or "customer support" and "client servicing", match only if the dictionary happens to link them.

- **Consequence:** good candidates score low or fail an essential-skill filter because of wording. This is the most likely cause of a recruiter saying "the system missed an obvious person".
- **Fix:** grow the dictionary from real job descriptions and CVs as they arrive, starting with your four role groups. Review every "skills mismatch" pass reason and every essential-skill failure for missing synonyms. Later, an AI reading step can be added for skills only; the code has a place for it.

### 4. Experience is filtered three times, and overqualification is ignored (Medium)

- Years of experience are checked by the job's minimum, by the job's seniority band and by the client's permitted bands. Three overlapping gates on one fact remove more people than any one of them intends.
- A job asking for "2 to 5 years" scores a 15-year candidate as a perfect fit. The upper figure is read and displayed but never used.

- **Consequence:** juniors squeezed out at the edges; seniors ranked top for junior roles, wasting the recruiter's three places.
- **Fix:** keep the minimum-years gate, make the two band checks advisory, and reduce the experience score gradually above the stated maximum.

### 5. Career breaks are penalised (Medium, with a fairness risk)

The "recent relevant work" part gives full marks only if the relevant work ended within 24 months, falling to 20% after six years. A person returning from maternity, caregiving, illness or study loses up to 10 points for the break alone.

- **Consequence:** this can disadvantage women returning to work, which is a discrimination risk even though gender is never read.
- **Fix:** reduce this part's weight, or apply it only when the job says recent experience is required. Record the decision.

### 6. It will not keep up with volume (Medium)

Every CV is scored against every live job. Scoring runs only when something happens on the site (an upload, an approval, an application, a button). There is no background schedule, and each run handles a limited batch.

- **Consequence:** with thousands of candidates, a new job is ranked only partly, with no sign on the recruiter's screen that the list is incomplete.
- **Fixed in this change:** applications and newly published roles are now scored at once, which removes the day-to-day case found in the audit.
- **Still to do before scale:** a scheduled background run, and a line on the shortlist that says "ranking in progress" when work is waiting.

### 7. Recruiters are shown the score they are meant not to see (Medium)

The design says recruiters see the best three without scores, so they judge the person. The one-line summary under each name begins with the score and its range. Found in the audit (F7.2b); not fixed here.

### 8. The recruiter cannot search or look beyond three (Medium)

If the ranking is wrong for a job, the recruiter's only tools are 15 passes a day. There is no search by name or skill, and the recruiter cannot open the CV (audit U7.5).

- **Consequence:** the quality of every shortlist depends entirely on an unvalidated ranking.
- **Fix:** let recruiters open the CV, and give team managers a search across the candidates their team may see.

### 9. CVs that are scans or unusual layouts (Medium)

Only text is read. A scanned CV, a photo of a CV, or a two-column design can come out empty or scrambled. Such CVs go to an administrator's manual queue, where someone retypes the key facts.

- **Consequence:** in India many CVs are scans or phone photos; the manual queue could become the main route.
- **Fix:** measure it on the first real CVs. If more than about one in ten needs retyping, add text recognition for scans.

### 10. Settings that no longer do anything (Low)

The client set-up form still asks for a minimum match score and a maximum number of CVs released per job. Both belonged to the removed self-service model and now change nothing. They make the form longer and suggest control that is not there.

## Is the technique relevant to your business?

Yes, with one caution. For permanent recruitment by a consultant, the right tool is one that brings the likely candidates to the top and explains why, then leaves the judgement to the recruiter. That is what this does. Automatic rejection, personality scoring or video analysis would be the wrong direction, and none is present.

The caution: the engine was designed when clients were going to browse candidates themselves, so it is built to be strict and to hide information. In the model you have chosen, the recruiter is the safeguard. The engine should now lean the other way: include the doubtful candidate with a question mark, and let the recruiter see more.

## Recommended order

1. Open the CV to recruiters and remove the score from their summary line (audit U7.5 and F7.2b).
2. Turn "not found" on experience and essential skills into a question for the recruiter.
3. Use the maximum years, and make the two seniority band checks advisory.
4. Decide on the career-break rule and record the decision.
5. Add a scheduled scoring run and a "ranking in progress" line before volume grows.
6. After the first 100 real submissions, compare outcomes with scores and adjust the numbers. Repeat monthly.
7. Remove the two dead settings from the client form.
