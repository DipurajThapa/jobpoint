import type { Landing } from "@/components/landing-page";

/** Copy for the two landing pages. The FAQ entries also feed each page's structured data. */
export const EMPLOYER_PAGE: Landing = {
  audience: "employer",
  eyebrow: "FOR EMPLOYERS",
  title: [`Hire for IT and non-IT roles.`, "Pay only when your hire joins."],
  intro: `Jobboard300 is a recruitment consultancy for small and growing businesses. We recruit for both IT and non-IT roles, from software, data and IT support to accounts, sales and business operations. Send a short enquiry and, if you like, choose a time for a call. A recruiter screens candidates against your requirements and suggests candidates for your consideration. You pay only when the person you choose joins.`,
  cta: "Send a hiring enquiry",
  secondary: { label: "See the terms", href: "#page-terms" },
  image: { src: "/images/candidate-meeting.webp", alt: "A hiring manager and a Jobboard300 recruiter reviewing a role together" },
  proof: ["NO JOB DESCRIPTION NEEDED TO ENQUIRE", "Fee of 7.5% to 8.33%, only when your hire joins", "Replacement terms agreed in writing", "NO CHARGE FOR A CALL OR A SHORTLIST"],
  steps: { eyebrow: "HOW HIRING WORKS", title: ["How our recruitment service", "works for employers."], intro: "You know what happens at each step, from the first call to joining day.", items: [
    ["Send an enquiry, choose a call time", "Tell us in a few lines what you are looking for and, if you like, choose a time. On an agreed call, a consultant can discuss the role, salary range, location and timeline."],
    ["Review the shortlist", "We review candidates against your brief and share relevant profiles with a recruiter's note. You assess their suitability through your hiring process."],
    ["Interview through us", "Interviews are arranged through Jobboard300. You see each candidate's profile while your process with them is open."],
    ["Offer and joining", "We pass your offer to the candidate and keep you informed of each step up to joining day."],
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
    { icon: "dashboard", title: "A private hiring workspace", text: "Track candidates, interviews, offers and joining dates for every open role in one place." },
  ] },
  faqs: [
    { question: "How much does it cost to hire through Jobboard300?", answer: "Jobboard300 charges employers a placement fee of 7.5% to 8.33% of the hired person's annual salary. The percentage is agreed for your account in advance, and the fee is payable only when the person joins. The enquiry, the call with a consultant, the shortlist and the interviews cost nothing. Taxes are added as the law requires." },
    { question: "How do we start hiring through Jobboard300?", answer: "To start hiring through Jobboard300, send a short enquiry saying what you are looking for; no job description is needed. You can request a call time. A request is subject to availability and is not a confirmed appointment. Response times vary. Terms are agreed in writing before we start." },
    { question: "What happens if the person we hire leaves?", answer: "If a person placed by Jobboard300 leaves within 60 days of joining, we provide one replacement for the same role free of charge. The replacement does not apply if the fee is unpaid, if the role or its terms changed materially after the offer, or if the departure was caused by redundancy or a breach on the employer's side." },
    { question: "Which roles does Jobboard300 recruit for?", answer: "Jobboard300 supports IT and non-IT recruitment for small and growing businesses. IT hiring covers software development and testing, data and analytics, and IT support and infrastructure. Non-IT hiring covers accounts and finance, sales and business development, and customer support and operations. Tell us about the role so a consultant can confirm how we can help." },
    { question: "Can we search your candidate database ourselves?", answer: "No. Employers cannot search or browse the Jobboard300 candidate database. A recruiter selects candidates for each role and submits them to you with a note on why each one fits. This protects candidates' personal data, and helps you assess how each candidate compares with your requirements." },
    { question: "When do we see a candidate's contact details?", answer: "You see a candidate's phone number and email when you make an offer. Until then you see the profile and CV with contact details removed, for as long as your hiring process with that person is open. Every CV you download carries a watermark that identifies your company." },
    { question: "Do we need to sign a contract?", answer: "Yes. You accept the terms for employers when you send an enquiry, and Jobboard300 signs a recruitment services agreement with each employer before submitting any candidate. The agreement sets your fee percentage and sets out any replacement conditions. Under the terms, a candidate we introduce is hired through us for 12 months from the introduction." },
  ],
  closing: { title: "Have a role to fill?", text: "Send a short enquiry and, if you like, choose a time for a call with a consultant. It costs nothing." },
};

export const CANDIDATE_PAGE: Landing = {
  audience: "candidate",
  eyebrow: "FOR JOB SEEKERS",
  title: ["Find IT and non-IT jobs.", `Register your CV for free.`],
  intro: `Jobboard300 is a job board and job consultancy with recruiters behind it. We recruit for both IT and non-IT roles, from software, data and IT support to accounts, sales and business operations at small and growing businesses. Registering your CV is free. A recruiter may contact you about a relevant opening. Registration does not guarantee contact, an interview or a job.`,
  cta: "Upload your CV",
  secondary: { label: "Browse current jobs", href: "/jobs" },
  image: { src: "/images/candidate-meeting.webp", alt: "A candidate talking through their experience with a Jobboard300 recruiter" },
  proof: ["IT AND NON-IT JOBS", "Free to register and apply", "Your CV is shared only with your consent", "Recruiter-reviewed matches"],
  steps: { eyebrow: "HOW IT WORKS", title: ["How to register your CV", "and apply for jobs."], intro: "You should know what happens to your CV at every step.", items: [
    ["Upload your CV", "Give your name, email, mobile number and CV, and choose what we may do with it. We read your skills and experience from the CV."],
    ["A recruiter reviews it", "Software reads your skills and experience from the CV. A recruiter reviews applications for the roles we are currently recruiting for."],
    ["Interviews", "If there is a fit, we contact you. We ask before sharing your CV, unless you have already agreed, and interviews are arranged through us."],
    ["Offer and joining", "Your recruiter keeps you informed of each step by phone or email, and in your account if you have one."],
  ] },
  terms: { eyebrow: "WHAT YOU AGREE TO", title: ["Fair terms,", "in plain words."], intro: "These are the main points. You accept the full terms for job seekers when you register.", rows: [
    ["No fee to be considered", "Registering your CV and applying for jobs are free. We never charge you for being put forward for a role, and payment never affects who is shortlisted."],
    ["Accurate information", "Your CV and details must be true and your own. False information can end your application."],
    ["Your consent decides", "We share your CV with an employer only with your consent. You can withdraw it or ask us to delete your data at any time."],
  ], link: { label: "Read the full terms for job seekers", href: "/terms/job-seekers" } },
  extra: { eyebrow: "IT AND NON-IT CAREERS", title: ["Technology roles.", "Business roles."], intro: "Explore both career paths, with the same support from CV registration to interviews and joining.", cards: [
    { icon: "code", title: "IT: Software and testing", text: "Software development, web and application development, and quality assurance roles." },
    { icon: "analytics", title: "IT: Data and analytics", text: "Data analysis, business intelligence and data engineering roles." },
    { icon: "dns", title: "IT: Support and infrastructure", text: "IT support, systems administration, cloud and network operations roles." },
    { icon: "account_balance", title: "Non-IT: Accounts and finance", text: "Accounting, GST and tax, payroll and billing roles." },
    { icon: "trending_up", title: "Non-IT: Sales and business development", text: "Sales, business development and client acquisition roles." },
    { icon: "support_agent", title: "Non-IT: Customer support and operations", text: "Customer service, voice and chat support, and business operations roles." },
  ] },
  faqs: [
    { question: "Is Jobboard300 free for job seekers?", answer: "Yes, Jobboard300 is free for job seekers. Registering your CV, applying for jobs and being put forward to an employer cost nothing, and we never charge you for being considered or placed. Payment never affects who is shortlisted: a recruiter shortlists on how well your experience fits the role." },
    { question: "What do I need to register my CV?", answer: "To register with Jobboard300 you need your name, email, mobile number and your CV as a PDF or DOCX file of up to 5 MB, and you tick two boxes: one to accept the terms for job seekers and one to let us store and use your CV. Where you would like to work is optional." },
    { question: "What happens after I upload my CV?", answer: "After you upload your CV, Jobboard300 shows you a reference number to keep. Software reads your skills and experience from the CV. A recruiter reviews applications for the roles we are currently recruiting for and may contact you about a relevant opening. We ask before sharing your CV, unless you already agreed on the form." },
    { question: "Who sees my CV?", answer: "Jobboard300 recruiters see your CV. An employer sees it only with your consent, for a role that suits you, and only while they are considering you for it. Your phone number and email reach the employer only at offer stage. Employers cannot search our candidate records, and every downloaded copy is watermarked with the employer's name." },
    { question: "Which jobs can I apply for?", answer: "You can browse and apply for published IT and non-IT openings. IT roles include software, testing, data and IT support; non-IT roles include accounts, sales, customer service and operations. Each listing shows its requirements, location and work mode. Availability depends on the roles employers are currently hiring for." },
    { question: "Can I delete my data?", answer: "Yes. You can ask Jobboard300 to delete your data, correct it or stop sharing your CV at any time, using the privacy request form on the privacy notice page. A recruiter verifies that the request comes from you before acting on it." },
  ],
  closing: { title: "Looking for IT or non-IT work?", text: "Upload your CV. It is free, and a recruiter may contact you about a relevant opening." },
};
