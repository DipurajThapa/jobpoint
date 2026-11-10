import type { Landing } from "@/components/landing-page";

/** Copy for the two landing pages. The FAQ entries also feed each page's structured data. */
export const EMPLOYER_PAGE: Landing = {
  audience: "employer",
  eyebrow: "FOR EMPLOYERS",
  title: ["Hire through a recruiter in Kolkata.", "Pay only when your hire joins."],
  intro: "Jobboard300 is a recruitment consultancy in Kolkata for IT and other office-based roles. Send a short enquiry and, if you like, choose a time for a call. A recruiter then screens candidates against your requirements and submits only those who meet them. You pay only when the person you choose joins.",
  cta: "Send a hiring enquiry",
  secondary: { label: "See the terms", href: "#page-terms" },
  image: { src: "/images/candidate-meeting.webp", alt: "A hiring manager and a Jobboard300 recruiter reviewing a role together" },
  proof: ["NO JOB DESCRIPTION NEEDED TO ENQUIRE", "Fee of 7.5% to 8.33%, only when your hire joins", "One free replacement within 60 days", "NO CHARGE FOR A CALL OR A SHORTLIST"],
  steps: { eyebrow: "HOW HIRING WORKS", title: ["From your brief", "to joining day."], intro: "One recruiter handles your role from the first call until your hire has joined.", items: [
    ["Send an enquiry, choose a call time", "Tell us in a few lines what you are looking for and, if you like, choose a time. On a 30-minute call a consultant goes through the role, salary range, location and timeline."],
    ["Review the shortlist", "We screen our candidate pool and submit only candidates who meet your requirements, each with a recruiter's note."],
    ["Interview through us", "Interviews are arranged through Jobboard300. You see each candidate's profile while your process with them is open."],
    ["Offer and joining", "We stay with the candidate through the offer, the notice period and joining day."],
  ] },
  terms: { eyebrow: "FEE AND TERMS", title: ["Clear terms,", "agreed before we start."], intro: "These are the commercial terms. They are confirmed in a signed recruitment services agreement before any candidate is submitted.", rows: [
    ["Placement fee", "7.5% to 8.33% of the hire's annual salary, agreed for your account in advance. It is charged only when the candidate joins."],
    ["Replacement", "If the hire leaves within 60 days of joining, we provide one replacement for the same role free of charge. The conditions are in the terms for employers."],
    ["No upfront cost", "Sending an enquiry, the call with a consultant, a shortlist and the interviews cost nothing."],
    ["Candidate information", "Profiles and CVs are for your hiring decision only. Contact details are released when you make an offer, and every downloaded CV carries a watermark that identifies your company."],
    ["Direct hiring", "A candidate we introduce is hired through Jobboard300. This applies for 12 months from the introduction."],
  ], link: { label: "Read the full terms for employers", href: "/terms/employers" } },
  extra: { eyebrow: "ALSO AVAILABLE", title: ["Extra checks,", "when you want them."], intro: "Add these to a role when it needs them. We agree them with you before we start.", cards: [
    { icon: "psychology", title: "Aptitude and soft-skills test", text: "Our own test of aptitude, attitude and interpersonal skills, sent only to the candidates in your process." },
    { icon: "quiz", title: "Your own test", text: "Give us your questions and answers. We build the test, add to it where useful and run it for your shortlisted candidates." },
    { icon: "groups", title: "Contract and temporary staffing", text: "Short-term and project hires when a permanent role is not the right fit." },
    { icon: "dashboard", title: "A private hiring workspace", text: "Track candidates, interviews, offers and joining dates for every open role in one place." },
  ] },
  faqs: [
    { question: "How much does it cost to hire through Jobboard300?", answer: "Jobboard300 charges employers a placement fee of 7.5% to 8.33% of the hired person's annual salary. The percentage is agreed for your account in advance, and the fee is payable only when the person joins. The enquiry, the call with a consultant, the shortlist and the interviews cost nothing. Taxes are added as the law requires." },
    { question: "How do we start hiring through Jobboard300?", answer: "To start hiring through Jobboard300, send a short enquiry saying what you are looking for; no job description is needed. You can pick a time for a 30-minute call, Monday to Saturday, and a consultant confirms it or offers another. On the call we go through the role, salary range, location and timeline, then agree the terms in writing." },
    { question: "What happens if the person we hire leaves?", answer: "If a person placed by Jobboard300 leaves within 60 days of joining, we provide one replacement for the same role free of charge. The replacement does not apply if the fee is unpaid, if the role or its terms changed materially after the offer, or if the departure was caused by redundancy or a breach on the employer's side." },
    { question: "Which roles does Jobboard300 recruit for?", answer: "Jobboard300 recruits for white-collar roles in four groups: technology and IT, finance and accounts, sales and customer support, and operations, HR and administration. In technology this covers software developers, data analysts and engineers, cloud and DevOps engineers, testers and IT support staff. Jobboard300 is based in Kolkata." },
    { question: "Can we search your candidate database ourselves?", answer: "No. Employers cannot search or browse the Jobboard300 candidate database. A recruiter selects candidates for each role and submits them to you with a note on why each one fits. This protects candidates' personal data, and it means you spend your time only on people who meet the requirements you gave us." },
    { question: "When do we see a candidate's contact details?", answer: "You see a candidate's phone number and email when you make an offer. Until then you see the profile and CV with contact details removed, for as long as your hiring process with that person is open. Every CV you download carries a watermark that identifies your company." },
    { question: "Do we need to sign a contract?", answer: "Yes. You accept the terms for employers when you send an enquiry, and Jobboard300 signs a recruitment services agreement with each employer before submitting any candidate. The agreement sets your fee percentage and confirms the 60-day replacement. Under the terms, a candidate we introduce is hired through us for 12 months from the introduction." },
  ],
  closing: { title: "Have a role to fill?", text: "Send a short enquiry and, if you like, choose a time for a call with a consultant. It costs nothing." },
};

export const CANDIDATE_PAGE: Landing = {
  audience: "candidate",
  eyebrow: "FOR JOB SEEKERS",
  title: ["Upload your CV once.", "Be considered for every role that fits."],
  intro: "Jobboard300 is a job board and job consultancy in Kolkata, with recruiters behind it. Register your CV free of charge. It takes about a minute, and a recruiter considers you for IT and other office-based roles as employers open them.",
  cta: "Upload your CV",
  secondary: { label: "Browse current jobs", href: "/#jobs" },
  image: { src: "/images/career-conversation.webp", alt: "A candidate talking through their experience with a Jobboard300 recruiter" },
  proof: ["IT AND NON-IT ROLES", "Free to register and apply", "Your CV is shared only with your consent", "EVERY CV REVIEWED BY A RECRUITER"],
  steps: { eyebrow: "HOW IT WORKS", title: ["From your CV", "to joining day."], intro: "You should know what happens to your CV at every step.", items: [
    ["Upload your CV", "Give your name, email, mobile number and CV, and choose what we may do with it. We read your skills and experience from the CV."],
    ["A recruiter reviews it", "Software reads and sorts every CV so that none is missed. A recruiter then checks your fit for open roles."],
    ["Interviews", "When a role suits you, we contact you. We ask before sharing your CV, unless you have already agreed, and interviews are arranged through us."],
    ["Offer and joining", "We stay in touch through the offer, your notice period and your first weeks in the role."],
  ] },
  terms: { eyebrow: "WHAT YOU AGREE TO", title: ["Fair terms,", "in plain words."], intro: "These are the main points. You accept the full terms for job seekers when you register.", rows: [
    ["No fee to be considered", "Registering your CV and applying for jobs are free. We never charge you for being put forward for a role."],
    ["Accurate information", "Your CV and details must be true and your own. False information can end your application."],
    ["Your consent decides", "We share your CV with an employer only with your consent. You can withdraw it or ask us to delete your data at any time."],
    ["Commitment at offer stage", "When you receive an offer, we ask you to confirm that you intend to join and stay at least 60 days. If you leave within 60 days without a serious reason, we record it and give your profile lower priority for 12 months."],
    ["Fast Track is optional", "Fast Track is a paid package with skill tests and preparation advice. Nobody needs it to apply for jobs."],
  ], link: { label: "Read the full terms for job seekers", href: "/terms/job-seekers" } },
  extra: { eyebrow: "FAST TRACK", title: ["Prove your skills", "before the interview."], intro: "An optional paid package for candidates who want their skills verified and want to know what to prepare.", cards: [
    { icon: "quiz", title: "Technical tests in your skills", text: "Take a test in your own domain whenever you are ready. The questions adjust to your level as you answer." },
    { icon: "verified", title: "A verified level on your profile", text: "Each test places you as beginner, intermediate or expert. A strong result counts when recruiters shortlist." },
    { icon: "menu_book", title: "What to prepare next", text: "After every test you see the topics that held you back, so you know where to spend your time." },
    { icon: "support_agent", title: "Interview guidance", text: "Advice from recruiters on the roles and companies where your profile has the best chance." },
  ] },
  faqs: [
    { question: "Is Jobboard300 free for job seekers?", answer: "Yes, Jobboard300 is free for job seekers. Registering your CV, applying for jobs and being put forward to an employer cost nothing, and we never charge you for being considered or placed. Fast Track, a package of skill tests and interview guidance, is a separate paid service, and nobody needs it to apply." },
    { question: "What do I need to register my CV?", answer: "To register with Jobboard300 you need your name, email, mobile number and your CV as a PDF or DOCX file of up to 5 MB, and you tick two boxes: one to accept the terms for job seekers and one to let us store and use your CV. It takes about a minute. Where you would like to work is optional." },
    { question: "What happens after I upload my CV?", answer: "After you upload your CV, Jobboard300 shows you a reference number to keep. Software reads your skills and experience from the CV, and a recruiter reviews your fit for the roles we are filling. We contact you when a role suits you, and we ask before sharing your CV unless you already agreed on the form." },
    { question: "Who sees my CV?", answer: "Jobboard300 recruiters see your CV. An employer sees it only with your consent, for a role that suits you, and only while they are considering you for it. Your phone number and email reach the employer only at offer stage. Employers cannot search our candidate records, and every downloaded copy is watermarked with the employer's name." },
    { question: "Which jobs can I apply for?", answer: "You can apply for white-collar jobs in technology and IT, finance and accounts, sales and customer support, and operations, HR and administration. Open roles are listed on the Jobboard300 home page with their location and work mode. If none fits today, register your CV and a recruiter will consider you for new openings." },
    { question: "What is Fast Track?", answer: "Fast Track is an optional paid package from Jobboard300 for candidates who want their skills verified. It includes technical tests in your own skills, your level on each test, the topics to prepare and interview guidance. A strong test result counts when recruiters shortlist. Paying alone does not move you up or guarantee a job." },
    { question: "What happens if I leave a job soon after joining?", answer: "If you leave a job found through Jobboard300 within 60 days of joining without a serious reason, we record it and give your profile lower priority for 12 months. We do not charge you any fee or penalty. Serious reasons include unpaid salary, an unsafe workplace, harassment, a materially different role, and a medical or family emergency." },
    { question: "Can I delete my data?", answer: "Yes. You can ask Jobboard300 to delete your data, correct it or stop sharing your CV at any time, using the privacy request form on the privacy notice page. A recruiter verifies that the request comes from you before acting on it." },
  ],
  closing: { title: "Ready to be considered?", text: "Upload your CV and a recruiter will review it against the roles we are filling." },
};
