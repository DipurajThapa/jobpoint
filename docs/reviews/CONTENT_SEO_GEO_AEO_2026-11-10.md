# Jobboard300 public pages: content review and ready-to-paste copy

Reviewed 10 November 2026 on the local site, as served and in source. Nothing was changed. The forms, header and footer were being rebuilt during the review, so "Current" means the text served that day.

## Summary

1. The new forms already match your decisions 1, 2, 3 and 5. The home hero and the strip under it already carry no fee or replacement facts (decision 4). One leftover remains: the home page's Twitter share text still says "one free replacement within 60 days" (proposal 31).
2. No page title, main heading or description contains "Kolkata". The city appears only in the footer and in hidden data. This is the largest search gap.
3. Several page texts still describe the old forms (proposals 36, 41, 47).
4. Three promises depend on things I could not confirm are switched on: email confirmation, WhatsApp messages, and "a consultant will contact you within one working day" (items 121 to 123).
5. The privacy notice and terms now contradict the new forms in new ways (items 108 to 115). This needs your lawyer.

---

## Part 1. Page-by-page critique

### Home page (/)

6. **Audience and intent.** The page serves both readers and separates them well. The "Talk to a recruiter" button in the About section and "Contact Jobboard300" in the FAQ both open the employer enquiry form, whoever clicks. The audit recorded this as R18.
7. **SEO.** The title is 75 characters and the description 159; both are cut off in search results. Neither names a place. The main heading "Jobs for professionals. Screened hires for employers." contains no phrase people search for.
8. **AEO.** Six of the nine FAQ answers are under 40 words, and several do not name Jobboard300, so they cannot be quoted alone. There is no question on what happens after a CV is uploaded or how an employer starts.
9. **GEO.** The facts are plain and consistent. Missing: where the firm is, and the new enquiry-and-call process.
10. **Marketing.** "Free for job seekers", "Every CV reviewed by a recruiter" and "consent before your CV is shared" each appear three times in the first two screens: hero, strip and About row. The About row could carry new facts.
11. **Marketing.** The "Candidate guidance" card promises "Practical help with finding roles, applying and preparing for interviews". The only guidance I found in the product is inside Fast Track, which is paid. A reader will take the card as free.
12. **Sales.** The enquiry form is opened by five labels: "Hire talent", "Talk to a recruiter", "Send a hiring enquiry", "I'm hiring" and "Contact Jobboard300". The CV form has four: "Upload your CV", "Register your CV", "Upload my CV" and "I'm looking for work".
13. **Sales.** Step 01 of "How it works" says "Employers share the role, location and salary range", which is the old form.

### Employers page (/employers)

14. **Audience and intent.** Single reader, clear. Fee and replacement belong here and are stated.
15. **SEO.** The title is exactly 60 characters and the description 162. The main heading "A screened shortlist. Pay only on placement." names neither the service nor the city.
16. **AEO.** The replacement answer is 22 words and the roles answer is a fragment with no subject. There is no "How do we start?" question.
17. **GEO.** The fee is stated with units. The replacement is stated without its conditions, which are in the terms for employers.
18. **Marketing.** Step 1 ("Tell us the position, salary range, location and timeline") and the closing line ("Send the requirement and a recruiter will call you to confirm the brief") describe the old form.
19. **Marketing.** "They are agreed as part of your package" uses a word that is never explained. I could not confirm whether the tests cost extra.
20. **Sales.** One action and one label, which is good. Booking a call, the strongest new feature, is not mentioned anywhere on the page.
21. **Sales.** "Interview through us. We arrange every interview." conflicts with the client workspace, where clients schedule interviews themselves (audit R7).

### Job seekers page (/job-seekers)

22. **Audience and intent.** Single reader, no employer facts. The "60 days" here is the candidate's own commitment, so it is correctly placed.
23. **SEO.** The title is 61 characters. There is no place name anywhere on the page.
24. **AEO.** "Which jobs can I apply for?" and "Who sees my CV?" are answered in fragments. There is no question on what to prepare, what happens next, or WhatsApp.
25. **Marketing.** Step 1 says "Add your skills, experience, expected salary and notice period". The form asks for none of these (audit R19, now more wrong).
26. **Marketing.** "We ask before sharing your CV" is not true for someone who ticked the sharing box on the form.
27. **Sales.** The FAQ aside says "Send us a message and a recruiter will reply", but there is no button, email or phone for a job seeker.

### Job page (/jobs/…)

28. **SEO.** The title is "Junior Accountant | Jobboard300", with no location, though people search "accountant job in Durgapur". The description is the first 155 characters of the advert, so it can end mid-word.
29. **SEO, for the technical reviewer.** Roles shown as "Confidential client" carry no job structured data, so they cannot appear in Google's job listings.
30. **Sales.** The apply box says "Interested in this role?" and "Send your details and our team will be in touch." It does not say that applying is free, quick or confirmed by email; that appears only below the button.

---

## Part 2. Ready-to-paste copy

Each item gives Current, New, Where and Why. Titles are counted with " | Jobboard300" added where the site adds it.

### Titles, descriptions and share text

31. **Home title, description and share text.**
    - Current title: "Jobboard300 | Job board and recruitment consultancy for IT and non-IT roles"
    - New title (57): "Jobboard300 | Job board and recruitment agency in Kolkata"
    - Current description: "Jobboard300 is a job board and recruitment consultancy for IT and non-IT professionals. Upload your CV free, or hire screened talent and pay only on placement."
    - New description (145): "Jobboard300 is a job board and recruitment consultancy in Kolkata for IT and office roles. Register your CV free, or send a short hiring enquiry."
    - Current share title: "Jobboard300 | Job board and recruitment consultancy"
    - New share title: "Jobboard300 | Jobs and recruitment in Kolkata"
    - Current share description: "Find IT and non-IT professional jobs, or hire recruiter-screened talent and pay only on a successful placement."
    - New share description: "Find IT and office jobs, or hire through a recruiter who screens every candidate. A recruitment consultancy in Kolkata. Free for job seekers."
    - Current Twitter description: "Jobs for professionals. Screened shortlists for employers, with one free replacement within 60 days."
    - New Twitter description: "Jobs for professionals and screened shortlists for employers, from a recruitment consultancy in Kolkata. Free for job seekers."
    - Where: app/layout.tsx
    - Why: fits the length limits, names the city, and removes the replacement fact from a general card (decision 4).

32. **Employers title and description.**
    - Current title: "Hire screened talent and pay only on placement"
    - New title (57 with suffix): "Recruitment agency in Kolkata for employers"
    - Current description: "Hire IT and non-IT professionals through Jobboard300. A recruiter-screened shortlist, a fee of 7.5% to 8.33% on placement and one free replacement within 60 days."
    - New description (153): "Hire IT and office staff through Jobboard300, Kolkata. A recruiter-screened shortlist, a 7.5% to 8.33% fee only when your hire joins, 60-day replacement."
    - Where: app/employers/page.tsx (title, description, the share copy and the "service" description all repeat this text)
    - Why: puts the phrase employers search in the title and fits the limits.

33. **Job seekers title and description.**
    - Current title: "Upload your CV and apply for IT and non-IT jobs"
    - New title (56 with suffix): "Job consultancy in Kolkata: free CV upload"
    - Current description: "Register your CV free on the Jobboard300 job board. A recruiter matches you to IT and non-IT professional jobs and shares your CV only with your consent."
    - New description (149): "Register your CV free with Jobboard300, Kolkata. A recruiter reviews it for IT, accounts, sales and office jobs and shares it only with your consent."
    - Where: app/job-seekers/page.tsx
    - Why: "job consultancy in Kolkata" is how candidates search, and it is true of the firm.

34. **Job page title and description (pattern).**
    - Current title: "{job title}"
    - New title: "{job title} job in {location}", for example "Junior Accountant job in Durgapur | Jobboard300" (47)
    - Current description: first 155 characters of the advert
    - New description: "{job title} job in {location} ({employment type}, {work mode}) through Jobboard300. Apply free with your CV; a recruiter reviews every application."
    - Where: app/jobs/[id]/page.tsx
    - Why: the location is half of every job search, and a fixed pattern never ends mid-word.

35. **Legal page descriptions.** These are search snippets, not legal text. Paste them when the pages themselves are rewritten.
    - Privacy. Current: "Candidate and employer data use, consent choices and privacy requests at Jobboard300." New (151): "How Jobboard300 uses the details and CVs of job seekers and employers, the consent choices you have, and how to ask for access, correction or deletion."
    - Terms of use. Current: "Use of the Jobboard300 recruitment website." New: "The general terms for using the Jobboard300 website, its job listings and its forms."
    - Terms for employers. Current: "The terms an employer accepts when sending a hiring requirement to Jobboard300." New (145): "The terms for employers who hire through Jobboard300: the placement fee, the 60-day replacement, introduced candidates and candidate information."
    - Terms for job seekers. Current: "The terms a job seeker accepts when registering a CV or applying through Jobboard300." New (133): "The terms for job seekers who register a CV or apply through Jobboard300: what is free, consent, the offer commitment and Fast Track."
    - Privacy safeguards. Current: "Recruitment data safeguards and the public launch review status." New (133): "The safeguards Jobboard300 applies to CVs and recruitment records: private storage, recorded consent, human review and an access log."
    - Titles stay as they are.
    - Where: app/privacy/page.tsx, app/terms/page.tsx, app/terms/employers/page.tsx, app/terms/job-seekers/page.tsx, app/compliance/page.tsx

### Home page

36. **Hero.**
    - Current eyebrow: "JOB BOARD AND RECRUITMENT CONSULTANCY"
    - New eyebrow: "JOB BOARD AND RECRUITMENT CONSULTANCY · KOLKATA"
    - Current heading: "Jobs for professionals. / Screened hires for employers."
    - New heading: "Jobs and screened hires, / from a recruitment consultancy in Kolkata."
    - Current paragraph: "Jobboard300 is a job board and recruitment consultancy for IT and other office-based roles. Candidates upload a CV once and apply for jobs that fit. Employers receive a recruiter-screened shortlist and pay only for a successful placement."
    - New paragraph: "Jobboard300 is a job board and recruitment consultancy in Kolkata for IT and other office-based roles. Job seekers register a CV once, free, and a recruiter considers them for every role that fits. Employers send a short enquiry, speak to a consultant and receive a recruiter-screened shortlist."
    - Where: app/home-client.tsx
    - Why: main phrase in the heading and first paragraph; describes the new enquiry; no fee facts.

37. **Hero proof and the two floating cards.** These already meet decision 4. One optional change, so the hero is fully neutral:
    - Current card: "FOR EMPLOYERS / Pay only on placement."
    - New card: "YOUR CV / Shared only with your consent."
    - Keep "Free / for job seekers to register a CV and apply" and "EVERY CV / Reviewed by a recruiter."
    - Where: app/home-client.tsx
    - Why: the picture shows a candidate; the payment fact is still in the employer panel lower down.

38. **Strip under the hero.**
    - Current: "IT AND NON-IT ROLES | Free for job seekers | Every CV reviewed by a recruiter | YOUR CV IS SHARED ONLY WITH YOUR CONSENT"
    - New: "RECRUITMENT CONSULTANCY IN KOLKATA | Free for job seekers | A recruiter reads every CV | IT, ACCOUNTS, SALES AND OFFICE ROLES"
    - Where: app/home-client.tsx
    - Why: adds place and role types; drops the consent line, which is already in the hero if you take proposal 37.

39. **About row (three facts).**
    - Current: "Free / for job seekers", "Every CV / reviewed by a recruiter", "Your consent / before your CV is shared"
    - New: "About a minute / to register your CV", "30 minutes / a first call for employers, booked online", "Kolkata / where we are based"
    - Where: app/home-client.tsx
    - Why: stops the triple repetition; each is a new, true fact.

40. **About button.**
    - Current: "Talk to a recruiter"
    - New: "Send a hiring enquiry"
    - Where: app/home-client.tsx
    - Why: it opens the employer form; the label should say so.

41. **Services.**
    - Current heading: "Hiring solutions for employers. / Career support for candidates."
    - New heading: "Recruitment services for employers. / A free CV register for job seekers."
    - Current card 1: "We take your brief, search our candidate pool and submit a screened shortlist. You pay only on a successful placement."
    - New card 1: "A consultant takes your brief on a call. A recruiter screens candidates against it and submits only those who meet it. You pay only when the person you choose joins."
    - Current card 3: "Candidate guidance / Practical help with finding roles, applying and preparing for interviews."
    - New card 3: "CV registration and Fast Track / Register your CV free and be considered for every role that fits. Fast Track, an optional paid package, adds skill tests and interview guidance."
    - Where: app/home-client.tsx
    - Why: card 3 no longer implies free coaching. Card 2 (contract staffing) is item 124.

42. **For job seekers panel, third step.**
    - Current: "We contact you when a role fits, and ask before sharing your CV."
    - New: "We contact you when a role fits. We ask before sharing your CV, unless you have already agreed."
    - Where: app/home-client.tsx
    - Why: true for people who ticked the sharing box.

43. **How it works, step 01.**
    - Current: "Candidates share a CV. Employers share the role, location and salary range."
    - New: "Job seekers send a CV. Employers send a short enquiry and choose a time for a call."
    - Where: app/home-client.tsx

44. **FAQ aside.**
    - Current: "Not covered here? Send us a message and a recruiter will reply." with the button "Contact Jobboard300"
    - New: "Hiring? Send an enquiry and a consultant will contact you within one working day." with the button "Send a hiring enquiry"
    - Where: app/home-client.tsx
    - Why: says what the button does. A channel for job seekers is still missing (R18, item 126).

45. **One label per action.**
    - Enquiry form: use "Send a hiring enquiry" in place of "Hire talent" (hero) and "Talk to a recruiter". In the header, "Hiring enquiry" if space is tight.
    - CV form: use "Upload your CV" in place of "Register your CV" (empty job list).
    - The closing pair "I'm looking for work / I'm hiring" can stay, as a deliberate fork.
    - Where: app/home-client.tsx, components/public-header.tsx

46. **Home FAQ, complete replacement set.** The same list feeds the FAQ data search engines read, so the two stay identical. Each answer is 45 to 58 words. Where: lib/faqs.ts

    1. **What is Jobboard300?** Jobboard300 is a job board and recruitment consultancy based in Kolkata, India. Job seekers use it to find IT and other office-based jobs and to register a CV free of charge. Employers use it to hire through a recruiter, who screens candidates for each role and submits only those who meet the requirements.
    2. **Is Jobboard300 free for job seekers?** Yes, Jobboard300 is free for job seekers. Registering your CV, applying for jobs and being put forward to an employer cost nothing, and we never charge a candidate for being considered or placed. Fast Track, a package of skill tests and interview guidance, is a separate paid service, and it is optional.
    3. **How do I apply for a job on Jobboard300?** To apply, open a job on Jobboard300 and send your name, email, mobile number and CV; it takes about a minute. If no job fits today, register your CV instead and a recruiter will consider you for new openings. We read your skills and experience from the CV, so there is no long form to fill.
    4. **What happens after I upload my CV?** After you upload your CV, Jobboard300 confirms by email with a reference number. Software reads your skills and experience from the CV, and a recruiter reviews your fit for the roles we are filling. We contact you when a role suits you, and we ask before sharing your CV with an employer unless you already agreed.
    5. **Which roles does Jobboard300 recruit for?** Jobboard300 recruits for white-collar roles in technology and in office functions. In technology, that means software developers, data analysts and engineers, cloud and DevOps engineers, testers and IT support staff. In other functions, it means finance and accounts, sales, customer support, operations, HR and administration.
    6. **Will Jobboard300 share my CV with employers?** Jobboard300 shares your CV with an employer only with your consent, and only for a role that suits you. A recruiter reviews the fit first. The employer sees your profile only while they are considering you, and your contact details only at offer stage. You can withdraw consent or ask us to delete your data at any time.
    7. **How does Jobboard300 protect my data?** Jobboard300 keeps CVs in private storage and shows them to an employer only for a role you are being considered for. Employers see your contact details only at offer stage, and every CV an employer downloads carries a watermark naming that company, so a copy can be traced. Employers cannot search the candidate database.
    8. **Are hiring decisions made automatically?** No. Jobboard300 does not make hiring decisions automatically. Software reads each CV and sorts it against the requirements of a role, so that no application is missed. A recruiter then reviews every match before anyone is put forward, and the employer alone decides whom to interview and whom to hire.
    9. **For employers: how do we start hiring through Jobboard300?** To start, send a short enquiry on Jobboard300 saying what you are looking for; no job description is needed. You can choose a time for a 30-minute call with a consultant, who goes through the role with you. The terms are agreed in a signed recruitment services agreement before any candidate is submitted.
    10. **For employers: what does it cost to hire through Jobboard300?** Jobboard300 charges employers a placement fee of 7.5% to 8.33% of the hired person's annual salary, agreed in advance and payable only when that person joins. Sending an enquiry, the call with a consultant, the shortlist and the interviews cost nothing. Job seekers are never charged a fee for being placed.
    11. **For employers: what happens if a new hire leaves?** For employers: if a person placed by Jobboard300 leaves within 60 days of joining, Jobboard300 provides one replacement for the same role free of charge. Conditions apply and are set out in the terms for employers and in the signed agreement; for example, the fee must have been paid and the role must not have changed.

    Why: every answer names its subject, answers in the first sentence and can be quoted alone. Employer facts are labelled, so a job seeker does not read the fee as theirs.

### Employers page

Where for proposals 47 to 53: lib/landing.ts (the employer block).

47. **Hero.**
    - Current heading: "A screened shortlist. / Pay only on placement."
    - New heading: "Hire through a recruiter in Kolkata. / Pay only when your hire joins."
    - Current intro: "Send Jobboard300 the role. A recruiter screens candidates against your requirements, submits those who meet them and arranges the interviews. You pay only when the person you choose joins."
    - New intro: "Jobboard300 is a recruitment consultancy in Kolkata for IT and other office-based roles. Send a short enquiry and choose a time for a call. A recruiter then screens candidates against your requirements and submits only those who meet them. You pay only when the person you choose joins."
    - The button "Send a hiring enquiry" stays.

48. **Proof strip (employer page; fee facts are right here).**
    - Current: "IT AND NON-IT ROLES | Fee of 7.5% to 8.33% on placement | One free replacement within 60 days | NO CHARGE FOR A SHORTLIST"
    - New: "NO JOB DESCRIPTION NEEDED TO ENQUIRE | Fee of 7.5% to 8.33%, only when your hire joins | One free replacement within 60 days | NO CHARGE FOR A CALL OR A SHORTLIST"
    - Why: answers the two objections at the button: effort and cost.

49. **Steps 1 and 3.**
    - Current step 1: "Share the role / Tell us the position, salary range, location and timeline. We confirm the brief with you before we start."
    - New step 1: "Send an enquiry, book a call / Tell us in a few lines what you are looking for and choose a time. On a 30-minute call a consultant goes through the role, salary range, location and timeline."
    - Current step 3: "Interview through us / We arrange every interview. You see each candidate's profile while your process with them is open."
    - New step 3: "Interview through us / Interviews are arranged through Jobboard300, by your recruiter or from your hiring workspace. You see each candidate's profile while your process with them is open."
    - Why: step 1 matches the new form. Step 3 agrees with what clients can do today; see R7 before pasting.

50. **Terms rows.**
    - Current "Replacement": "If the hire leaves within 60 days of joining, we provide one replacement for the same role free of charge."
    - New: "If the hire leaves within 60 days of joining, we provide one replacement for the same role free of charge. The conditions are in the terms for employers."
    - Current "No upfront cost": "Sending a requirement, receiving a shortlist and interviewing cost nothing."
    - New: "Sending an enquiry, the call with a consultant, a shortlist and the interviews cost nothing."
    - Current "Direct hiring": "A candidate we introduce is hired through Jobboard300. The agreement sets the period during which this applies."
    - New: "A candidate we introduce is hired through Jobboard300. This applies for 12 months from the introduction."
    - Why: the 12 months is in the published terms; stating it is more honest than "the agreement sets the period".

51. **"Also available" intro.**
    - Current: "Add these to a role when it needs them. They are agreed as part of your package."
    - New: "Add these to a role when it needs them. We agree them with you on the call."
    - Why: "package" is undefined. See item 125 on price.

52. **Employer FAQ, complete replacement set.** Each answer is 47 to 59 words.

    1. **How much does it cost to hire through Jobboard300?** Jobboard300 charges employers a placement fee of 7.5% to 8.33% of the hired person's annual salary. The percentage is agreed for your account in advance, and the fee is payable only when the person joins. The enquiry, the call with a consultant, the shortlist and the interviews cost nothing. Taxes are added as the law requires.
    2. **How do we start hiring through Jobboard300?** To start hiring through Jobboard300, send a short enquiry saying what you are looking for; no job description is needed. You can pick a time for a 30-minute call, and a consultant confirms it or offers another. On the call we go through the role, salary range, location and timeline, then agree the terms in writing.
    3. **What happens if the person we hire leaves?** If a person placed by Jobboard300 leaves within 60 days of joining, we provide one replacement for the same role free of charge. The replacement does not apply if the fee is unpaid, if the role or its terms changed materially after the offer, or if the departure was caused by redundancy or a breach on the employer's side.
    4. **Which roles does Jobboard300 recruit for?** Jobboard300 recruits for white-collar roles in four groups: technology and IT, finance and accounts, sales and customer support, and operations, HR and administration. In technology this covers software developers, data analysts and engineers, cloud and DevOps engineers, testers and IT support staff. Jobboard300 is based in Kolkata.
    5. **Can we search your candidate database ourselves?** No. Employers cannot search or browse the Jobboard300 candidate database. A recruiter selects candidates for each role and submits them to you with a note on why each one fits. This protects candidates' personal data, and it means you spend your time only on people who meet the requirements you gave us.
    6. **When do we see a candidate's contact details?** You see a candidate's phone number and email when you make an offer. Until then you see the profile and CV with contact details removed, for as long as your hiring process with that person is open. Every CV you download carries a watermark that identifies your company.
    7. **Do we need to sign a contract?** Yes. Jobboard300 signs a recruitment services agreement with each employer before submitting any candidate. It sets your fee percentage, the 60-day replacement and the rule that a candidate we introduce is hired through us for 12 months. Sending an enquiry only starts the conversation; it does not commit you to hire.

    Note: answer 7 depends on item 112. Today the enquiry tick box also accepts the terms for employers.

53. **Closing band.**
    - Current: "Have a role to fill? / Send the requirement and a recruiter will call you to confirm the brief."
    - New: "Have a role to fill? / Send a short enquiry and choose a time for a call with a consultant. It costs nothing."

### Job seekers page

Where for proposals 54 to 57: lib/landing.ts (the candidate block).

54. **Hero intro.** The heading "Upload your CV once. / Be considered for every role that fits." stays.
    - Current intro: "Jobboard300 is a job board with recruiters behind it. Register your CV free of charge, and a recruiter matches you to IT and non-IT professional roles as employers open them."
    - New intro: "Jobboard300 is a job board and job consultancy in Kolkata, with recruiters behind it. Register your CV free of charge. It takes about a minute, and a recruiter considers you for IT and other office-based roles as employers open them."

55. **Steps 1 and 3.**
    - Current step 1: "Add your skills, experience, expected salary and notice period, and choose what we may do with your CV."
    - New step 1: "Give your name, email, mobile number and CV, and choose what we may do with it. We read your skills and experience from the CV. We confirm by email."
    - Current step 3: "When a role suits you, we ask before sharing your CV and then arrange the interviews with the employer."
    - New step 3: "When a role suits you, we contact you. We ask before sharing your CV, unless you have already agreed, and interviews are arranged through us."

56. **Job seeker FAQ, complete replacement set.** Each answer is 51 to 57 words.

    1. **Is Jobboard300 free for job seekers?** Yes, Jobboard300 is free for job seekers. Registering your CV, applying for jobs and being put forward to an employer cost nothing, and we never charge you for being considered or placed. Fast Track, a package of skill tests and interview guidance, is a separate paid service, and nobody needs it to apply.
    2. **What do I need to register my CV?** To register with Jobboard300 you need your name, email, mobile number and your CV as a PDF or DOCX file of up to 5 MB. It takes about a minute. We read your skills, experience and education from the CV, so there is nothing else to type. A preferred work location is optional.
    3. **What happens after I upload my CV?** After you upload your CV, Jobboard300 emails you a confirmation with a reference number. Software reads your skills and experience from the CV, and a recruiter reviews your fit for the roles we are filling. We contact you when a role suits you, and we ask before sharing your CV unless you already agreed.
    4. **Who sees my CV?** Jobboard300 recruiters see your CV. An employer sees it only with your consent, for a role that suits you, and only while they are considering you for it. Your phone number and email reach the employer only at offer stage. Employers cannot search our candidate records, and every downloaded copy is watermarked with the employer's name.
    5. **Will Jobboard300 message me on WhatsApp?** Jobboard300 messages you on WhatsApp only if you tick the WhatsApp box on the form. If you leave it unticked, we contact you by email, and by phone when a recruiter needs to speak to you. You can ask us to stop WhatsApp messages at any time without affecting your application.
    6. **Which jobs can I apply for?** You can apply for white-collar jobs in technology and IT, finance and accounts, sales and customer support, and operations, HR and administration. Open roles are listed on the Jobboard300 home page with their location and work mode. If none fits today, register your CV and a recruiter will consider you for new openings.
    7. **What is Fast Track?** Fast Track is an optional paid package from Jobboard300 for candidates who want their skills verified. It includes technical tests in your own skills, your level on each test, the topics to prepare and interview guidance. A strong test result counts when recruiters shortlist. Paying alone does not move you up or guarantee a job.
    8. **What happens if I leave a job soon after joining?** If you leave a job found through Jobboard300 within 60 days of joining without a serious reason, we record it and give your profile lower priority for 12 months. We do not charge you any fee or penalty. Serious reasons include unpaid salary, an unsafe workplace, harassment, a materially different role, and a medical or family emergency.
    9. **Can I delete my data?** Yes. You can ask Jobboard300 to delete your data, correct it or stop sharing your CV at any time, using the privacy request form on the privacy notice page. We verify that the request comes from you before we act. Withdrawing consent ends an employer's access to your profile for any open application.

    Answers 3 and 5 depend on items 121 and 122.

57. **FAQ aside (job seekers).**
    - Current: "Not covered here? Send us a message and a recruiter will reply."
    - New, until a contact channel exists: "Not covered here? The terms for job seekers and the privacy notice have the detail."
    - Where: components/landing-page.tsx (this text is shared with the employers page; the employer version should read "Not covered here? Send an enquiry and ask; a consultant will reply.")
    - Why: today the sentence promises a channel that does not exist for job seekers.

### Job page

Where for proposals 58 and 59: app/jobs/[id]/page.tsx

58. **Apply box.**
    - Current: "Interested in this role?" / "Send your details and our team will be in touch."
    - New: "Apply for this role" / "Send your name, contact details and CV. It is free and takes about a minute. We confirm by email and a recruiter reviews every application."

59. **Small labels.**
    - "All roles" → "All current jobs"
    - "What we're looking for" → "Requirements"
    - Current note: "Our team will review your application and contact you if your experience matches this opportunity. Your details are shared for this role only with your consent."
    - New note: "Jobboard300 is a recruitment consultancy in Kolkata. A recruiter reviews your application and contacts you if your experience matches this role. Your CV goes to the employer only with your consent."

### The new CV form

Where for proposals 60 to 62: components/public-enquiry-dialog.tsx and components/candidate-fields.tsx

60. **Intro.**
    - Current: "It takes about a minute and it is free. A recruiter reviews every CV and contacts you when a role fits."
    - New: "Free, and about a minute. Send your CV and how to reach you; we read your skills and experience from the CV. A recruiter reviews it and contacts you when a role fits."
    - The heading "Upload your CV." and the button "Upload my CV" stay.

61. **WhatsApp tick box.**
    - Current: "Send me updates on WhatsApp at this number, as well as by email."
    - New: "Yes, message me on WhatsApp at this number as well as by email. If I leave this unticked, Jobboard300 will not send me WhatsApp messages."
    - Why: states your rule in the person's own words.

62. **Line under the button.**
    - Current: "Registering is free. We confirm by email. To correct your details or replace your CV later, use the privacy request form."
    - New: "Registering is free. We confirm by email within a few minutes; check your spam folder if it does not arrive. To correct your details or replace your CV later, use the privacy request form."

### The new enquiry form

Where for proposals 63 to 65: components/public-enquiry-dialog.tsx

63. **Intro.**
    - Current: "A short message is enough. A consultant will call you to understand the role; the job description comes later."
    - New: "A few lines are enough; you do not need a job description. Choose a time for a call if you like. A consultant will go through the role with you, and nothing is charged until a person you choose joins."

64. **Call picker heading.**
    - Current: "Book a call with a consultant (optional · 30 minutes · India time)"
    - New: "Choose a time for a call with a consultant (optional · 30 minutes · India time). We confirm the time by email, or offer another."
    - Why: the time is a request that a person confirms. "Book" promises more than happens.

65. **WhatsApp tick box.**
    - Current: "You may also message me on WhatsApp at this number. Optional"
    - New: "Yes, you may also message me on WhatsApp at this number. If I leave this unticked, Jobboard300 will not send me WhatsApp messages. Optional"
    - The heading "Tell us what you are looking for.", the button "Send enquiry" and the line under it stay.

### Confirmation texts

Where for proposals 66 to 74: lib/public-forms.ts. Words in {braces} are filled in by the site.

66. **CV received, on screen.**
    - Title: "Thank you. Your CV is with us."
    - When the email was sent: "Your reference is {reference}. We have emailed the details to {email}. A recruiter will review your CV and contact you when a role fits."
    - When the email could not be sent: "Your reference is {reference}. Please keep it. A recruiter will review your CV and contact you when a role fits."
    - Change from today: the reference is always shown, so the screen and the email match.

67. **CV received, email.**
    - Subject, general: "We have your CV | Jobboard300 reference {reference}"
    - Subject, for a role: "We have your application for {role} | reference {reference}"
    - Body:

    > Dear {name},
    >
    > Thank you for registering your CV with Jobboard300. [For a role: Thank you for applying for {role}. Your CV is with Jobboard300.]
    >
    > Your reference is {reference}. Please quote it if you write to us.
    >
    > What happens next:
    > - A recruiter reviews your CV against the roles we are filling.
    > - We contact you when a role fits. We ask you before your CV is shared with an employer, unless you already agreed to that on the form.
    > - You will hear from us by email. [Only if WhatsApp was ticked: You also agreed to WhatsApp messages at {phone}; you can stop them at any time.]
    >
    > Registering and applying are free. Jobboard300 never charges a job seeker for being considered or placed. If anyone asks you for money in our name, do not pay; tell us.
    >
    > To correct your details, replace your CV or withdraw your consent, use the request form at {site}/privacy#privacy-request.
    >
    > Jobboard300, Kolkata
    > {site}

    Why: the "never pay" line protects candidates from fake-recruiter fraud, and it is true under your terms.

68. **CV received, WhatsApp (sent only if the box was ticked).**
    - "Jobboard300: we have your CV [or: your application for {role}]. Reference {reference}. A recruiter will review it and contact you when a role fits. The details are in your email. To stop WhatsApp messages, reply STOP."
    - See item 122 before using "reply STOP".

69. **Enquiry received without a call, on screen.**
    - Title: "Thank you. Your enquiry is with us."
    - Message: "Your reference is {reference}. We have emailed the details to {email}. A consultant will contact you within one working day to arrange a call."

70. **Enquiry received without a call, email.**
    - Subject: "We have your hiring enquiry | Jobboard300 reference {reference}"
    - Body:

    > Dear {name},
    >
    > Thank you for your enquiry on behalf of {company}. Your reference is {reference}.
    >
    > A Jobboard300 consultant will contact you within one working day to arrange a call.
    >
    > On the call we go through the role, the salary range, the location and your timeline. You do not need a job description; we write up the brief with you. If we are a fit, we agree the terms in a recruitment services agreement before we start.
    >
    > Nothing is charged for the enquiry, the call or a shortlist. The fee applies only when a person you choose joins.
    >
    > Our terms for employers: {site}/terms/employers
    >
    > Jobboard300, Kolkata
    > {site}

71. **Enquiry received without a call, WhatsApp (only if ticked).**
    - "Jobboard300: we have your hiring enquiry for {company}. Reference {reference}. A consultant will contact you within one working day. The details are in your email. To stop WhatsApp messages, reply STOP."

72. **Enquiry with a call time, on screen.**
    - Title: "Thank you. Your enquiry is with us."
    - Message: "Your reference is {reference}. You asked for a call on {day, date, time} India time. A consultant will confirm this time by email, or offer another."

73. **Enquiry with a call time, email.**
    - Subject: "Your call request for {date}, {time} | Jobboard300 enquiry {reference}"
    - Body: as in proposal 70, with the second paragraph replaced by:

    > You asked for a 30-minute call on {day, date, time} India time. A Jobboard300 consultant will confirm this time, or offer another, by email [if ticked: or WhatsApp]. Please keep the time free until you hear from us.

74. **Enquiry with a call time, WhatsApp (only if ticked).**
    - "Jobboard300: we have your hiring enquiry for {company}. Reference {reference}. Call requested for {day, date, time} India time; a consultant will confirm. To stop WhatsApp messages, reply STOP."

### The summary AI assistants read (llms.txt)

75. **Replacement text.** {origin} is the site address, filled in automatically. The FAQ block continues to be filled from the home FAQ list in proposal 46. Where: app/llms.txt/route.ts

```
# Jobboard300

> Jobboard300 is a job board and recruitment consultancy based in Kolkata, India, for IT and other office-based (white-collar) roles. Job seekers register a CV and apply for jobs free of charge. Employers send an enquiry, speak to a consultant and hire recruiter-screened candidates. Employers pay a placement fee of 7.5% to 8.33% of the hired person's annual salary, only when that person joins.

## Key facts
- What it is: a job board and recruitment consultancy (placement agency)
- Where: Kolkata, West Bengal, India
- Roles: technology and IT; finance and accounts; sales and customer support; operations, HR and administration
- Cost to job seekers: nothing to register a CV, apply or be placed. Fast Track is an optional paid package of skill tests and interview guidance.
- Cost to employers: 7.5% to 8.33% of the hire's annual salary, agreed in advance, payable when the hire joins. No charge for an enquiry, a call, a shortlist or interviews.
- Replacement for employers: one free replacement for the same role if the hire leaves within 60 days of joining. Conditions are in the terms for employers.
- Privacy: a CV is shared with an employer only with the candidate's consent. Employers cannot search the candidate database and see contact details only at offer stage.
- Decisions: software reads and sorts CVs, a recruiter reviews every match, and the employer makes the hiring decision.

## For job seekers
- Page for job seekers: {origin}/job-seekers
- Current jobs: {origin}/#jobs
- To register: name, email, mobile number and a CV (PDF or DOCX, up to 5 MB). Skills and experience are read from the CV.
- After registering: confirmation by email with a reference; WhatsApp messages only if the person agreed to them on the form.
- Terms for job seekers: {origin}/terms/job-seekers

## For employers
- Page for employers: {origin}/employers
- To start: a short enquiry (contact, company, work email, phone and a message). No job description is needed. A 30-minute call with a consultant can be requested, Monday to Saturday, 10 am to 6 pm India time.
- Before candidates are submitted: a signed recruitment services agreement.
- Service: permanent recruitment
- Terms for employers: {origin}/terms/employers

## Frequently asked questions
(filled from the home page FAQ list)

## Policies
- Privacy notice: {origin}/privacy
- Terms of use: {origin}/terms
- Privacy safeguards: {origin}/compliance
```

Why: adds the place, the new enquiry process and what is free, in sentences an assistant can lift. Contract staffing is left out until item 124 is settled.

---

## Part 3. Target search phrases

These are my judgement of how people in Kolkata, West Bengal and India search. They are not measured search volumes; check them in Google Search Console once the site has traffic.

76. **Home:** "recruitment consultancy in Kolkata", "job consultancy in Kolkata", "placement agency Kolkata", "job board Kolkata", "IT and non-IT jobs Kolkata".
77. **Employers:** "recruitment agency in Kolkata", "IT recruitment agency Kolkata", "manpower consultancy in Kolkata", "hiring agency West Bengal", "recruitment agency fees India", "placement consultancy charges percentage", "recruitment agency with replacement guarantee".
78. **Job seekers:** "job consultancy in Kolkata", "free job consultancy Kolkata", "placement consultancy for freshers Kolkata", "upload CV for jobs in Kolkata", "IT jobs in Kolkata", "accounts jobs in Kolkata", "non-IT jobs Kolkata".
79. **Job pages:** "{job title} job in {city}", for example "junior accountant job in Durgapur", "Tally accountant jobs Durgapur", "accountant vacancy West Bengal".
80. **Questions for the FAQs:** "is job consultancy free for candidates", "how much do recruitment agencies charge in India", "do placement agencies charge candidates", "what happens if a new hire leaves in 60 days".
81. **A gap to consider later:** searchers use "non-IT", "BPO", "back office" and "fresher". If you recruit for those, one page per role family and city would capture them (for example "Accounts jobs in Kolkata"). That is new pages, not a wording change.

---

## Part 4. Legal pages: problems only (for your lawyer)

These build on the audit items Q.stale.demo, R12, R13 and R14 and do not repeat them. Items 108 to 113 are new and caused by the new forms.

108. **The privacy notice says no email is sent.** It reads: "The website currently sends no automatic acknowledgement email". The new forms send one.
109. **The privacy notice lists the old fields.** It names an experience summary, role, location and number of hires, which the forms no longer ask for. It does not mention the WhatsApp consent or the requested call time, which are now stored.
110. **The privacy notice names no email provider.** It says no "bulk messaging provider is connected". The acknowledgement email goes through an outside mail service, which receives the person's name and address.
111. **The terms for job seekers conflict with the WhatsApp tick box.** Section 8 says "We contact you … by the phone number, WhatsApp number and email address you give us". Your rule is WhatsApp only with the box ticked.
112. **An enquiry now accepts the full terms for employers.** The enquiry tick box links to them, and their opening line says "You accept these terms when you send Jobboard300 a hiring requirement". They include the 12-month fee on introduced candidates. The general terms say an enquiry "starts a discussion, rather than a service engagement". Decide whether a first enquiry should accept only the privacy notice, with the terms accepted at the agreement.
113. **Consents are recorded against the demo-era notice.** Every form submission is stored as agreeing to the privacy notice version dated 9 November 2026, which is the text that says the site collects nothing.
114. **The replacement conditions differ between documents.** The draft agreement adds notice within 7 days of the departure, covers dismissal for performance or conduct, and says no refund is due. The website terms for employers do not say these. The employers page states the replacement with no conditions (proposal 50 adds a pointer).
115. **Mixed search settings on legal pages.** The two audience terms pages are open to search engines and in the sitemap. The privacy notice, general terms and safeguards pages are hidden from search. All five show the home page's title when shared.

---

## Part 5. Facts I could not confirm, and claims that must not be made

### Could not confirm

121. **That emails are sent on the live site.** The local site has no mail key, so every test confirmation showed the reference instead of "we have emailed". "We confirm by email" appears on both forms and in several proposals above. Send one real test before relying on it.
122. **That WhatsApp works at all.** No WhatsApp provider is connected. With consent, messages are stored in a queue and not delivered. "Reply STOP" cannot work until a provider is connected and STOP is handled.
123. **"Within one working day."** This is a promise by your staff, not something the product enforces. Call times are offered Monday to Saturday, 10 am to 6 pm India time. Confirm someone will keep both.
124. **Contract and temporary staffing.** It is on the home page, the employers page and in the hidden business data. I found no screen, fee or agreement for it; the draft agreement covers permanent placement only. Your own safeguards page says staffing as an employer needs a separate review. Confirm you offer it, or remove it.
125. **Fast Track price, and whether employer tests cost extra.** No price was set locally, and the page says "agreed as part of your package". I wrote no prices.
126. **Contact details.** No phone, email or street address is published. I have written "Kolkata" only, as the footer does. A job seeker with a question still has no channel (audit R18).
127. **Geographic reach.** "Based in Kolkata" is supported by the site. Which other cities you recruit for is not; the one test role is in Durgapur. I avoided "jobs in Kolkata" as a claim about where the jobs are.
128. **"About a minute."** Plausible for five fields and a file, not timed with real users.
129. **Whether the photographs show Jobboard300 staff.** Two captions say "a Jobboard300 recruiter" and "a Jobboard300 recruitment consultant". If they are stock photographs, change the wording to "A candidate and a recruitment consultant discussing a job" and "A hiring manager and a recruiter reviewing a role together". Where: app/home-client.tsx, lib/landing.ts
130. **"Every CV reviewed by a recruiter."** The audit found that website applications do not reach the recruiter until the owner presses "Run scoring now" (F5.20). I did not re-test this. Until it is fixed, the claim depends on that button being pressed.
131. **The site address.** It is a sub-address of the hosting service (jobboard300.dippurajthapa.chatgpt.site). A domain of your own would help trust and search, and every link in emails uses the current one. This is your decision.

### Must not be claimed

132. No numbers of placements, clients, candidates or years in business. No client names, testimonials, ratings or awards. None exist in the product or the documents.
133. No "guaranteed job", "guaranteed interview" or "guaranteed hire". Both sets of terms say the opposite.
134. No "money-back" or "refund". The agreement gives a replacement, not a refund.
135. No "we will WhatsApp you" without the tick box, and no statement that a WhatsApp message has been sent (item 122).
136. No "your call is booked" or "confirmed". The time is a request until a consultant confirms it.
137. No fee percentage or 60-day replacement in the home hero, the strip under it, or anything addressed to job seekers (your decision 4). Keep them on the employers page, the labelled employer FAQs, the terms and llms.txt.
138. No "compliant", "certified", "licensed" or "DPDP-compliant". Your safeguards page says none is claimed.
139. No "free interview coaching" or "free career guidance". The guidance that exists is part of paid Fast Track.
140. No "we ask before sharing your CV" without "unless you have already agreed". The form lets people agree in advance.
