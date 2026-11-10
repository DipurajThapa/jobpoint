import type { Landing } from "@/components/landing-page";

/** Copy for the two landing pages. The FAQ entries also feed each page's structured data. */
export const EMPLOYER_PAGE: Landing = {
  audience: "employer",
  eyebrow: "FOR EMPLOYERS",
  title: ["A screened shortlist.", "Pay only on placement."],
  intro: "Send Jobboard300 the role. A recruiter screens candidates against your requirements, submits those who meet them and arranges the interviews. You pay only when the person you choose joins.",
  cta: "Send a hiring requirement",
  secondary: { label: "See the terms", href: "#page-terms" },
  image: { src: "/images/candidate-meeting.webp", alt: "A hiring manager and a Jobboard300 recruiter reviewing a role together" },
  proof: ["IT AND NON-IT ROLES", "Fee of 7.5% to 8.33% on placement", "One free replacement within 60 days", "NO CHARGE FOR A SHORTLIST"],
  steps: { eyebrow: "HOW HIRING WORKS", title: ["From your brief", "to joining day."], intro: "One recruiter handles your role from the first call until your hire has joined.", items: [
    ["Share the role", "Tell us the position, salary range, location and timeline. We confirm the brief with you before we start."],
    ["Review the shortlist", "We screen our candidate pool and submit only candidates who meet your requirements, each with a recruiter's note."],
    ["Interview through us", "We arrange every interview. You see each candidate's profile while your process with them is open."],
    ["Offer and joining", "We stay with the candidate through the offer, the notice period and joining day."],
  ] },
  terms: { eyebrow: "FEE AND TERMS", title: ["Clear terms,", "agreed before we start."], intro: "These are the commercial terms. They are confirmed in a signed recruitment services agreement before any candidate is submitted.", rows: [
    ["Placement fee", "7.5% to 8.33% of the hire's annual salary, agreed for your account in advance. It is charged only when the candidate joins."],
    ["Replacement", "If the hire leaves within 60 days of joining, we provide one replacement for the same role free of charge."],
    ["No upfront cost", "Sending a requirement, receiving a shortlist and interviewing cost nothing."],
    ["Candidate information", "Profiles and CVs are for your hiring decision only. Contact details are released when you make an offer, and every downloaded CV carries a watermark that identifies your company."],
    ["Direct hiring", "A candidate we introduce is hired through Jobboard300. The agreement sets the period during which this applies."],
  ], link: { label: "Read the full terms for employers", href: "/terms/employers" } },
  extra: { eyebrow: "ALSO AVAILABLE", title: ["Extra checks,", "when you want them."], intro: "Add these to a role when it needs them. They are agreed as part of your package.", cards: [
    { icon: "psychology", title: "Aptitude and soft-skills test", text: "Our own test of aptitude, attitude and interpersonal skills, sent only to the candidates in your process." },
    { icon: "quiz", title: "Your own test", text: "Give us your questions and answers. We build the test, add to it where useful and run it for your shortlisted candidates." },
    { icon: "groups", title: "Contract and temporary staffing", text: "Short-term and project hires when a permanent role is not the right fit." },
    { icon: "dashboard", title: "A private hiring workspace", text: "Track candidates, interviews, offers and joining dates for every open role in one place." },
  ] },
  faqs: [
    { question: "How much does it cost to hire through Jobboard300?", answer: "The fee is 7.5% to 8.33% of the hire's annual salary, agreed in advance and charged only when the candidate joins. There is no charge for a shortlist or for interviews." },
    { question: "What happens if the person we hire leaves?", answer: "If the hire leaves within 60 days of joining, we provide one replacement for the same role free of charge." },
    { question: "Which roles do you recruit for?", answer: "White-collar roles in technology and IT, finance and accounts, sales and customer support, and operations, HR and administration." },
    { question: "Can we search your candidate database ourselves?", answer: "No. A recruiter selects and submits candidates for each role. This protects candidates' data and means you only see people who meet your requirements." },
    { question: "When do we see a candidate's contact details?", answer: "When you make an offer. Until then Jobboard300 arranges every interview, and the profile you see has contact details removed." },
    { question: "Do we need to sign a contract?", answer: "Yes. You accept the terms for employers when you send a requirement, and we sign a recruitment services agreement with you before submitting candidates." },
  ],
  closing: { title: "Have a role to fill?", text: "Send the requirement and a recruiter will call you to confirm the brief." },
};

export const CANDIDATE_PAGE: Landing = {
  audience: "candidate",
  eyebrow: "FOR JOB SEEKERS",
  title: ["Upload your CV once.", "Be considered for every role that fits."],
  intro: "Jobboard300 is a job board with recruiters behind it. Register your CV free of charge, and a recruiter matches you to IT and non-IT professional roles as employers open them.",
  cta: "Upload your CV",
  secondary: { label: "Browse current jobs", href: "/#jobs" },
  image: { src: "/images/career-conversation.webp", alt: "A candidate talking through their experience with a Jobboard300 recruiter" },
  proof: ["IT AND NON-IT ROLES", "Free to register and apply", "Your CV is shared only with your consent", "EVERY CV REVIEWED BY A RECRUITER"],
  steps: { eyebrow: "HOW IT WORKS", title: ["From your CV", "to joining day."], intro: "You should know what happens to your CV at every step.", items: [
    ["Upload your CV", "Add your skills, experience, expected salary and notice period, and choose what we may do with your CV."],
    ["A recruiter reviews it", "Software reads and sorts every CV so that none is missed. A recruiter then checks your fit for open roles."],
    ["Interviews", "When a role suits you, we ask before sharing your CV and then arrange the interviews with the employer."],
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
    { question: "Is Jobboard300 free for job seekers?", answer: "Yes. Registering your CV and applying for jobs are free. Fast Track is a separate paid package and is optional." },
    { question: "Which jobs can I apply for?", answer: "White-collar roles in technology and IT, finance and accounts, sales and customer support, and operations, HR and administration." },
    { question: "Who sees my CV?", answer: "Jobboard300 recruiters. An employer sees it only with your consent, for a role that suits you, and only while they are considering you." },
    { question: "What is Fast Track?", answer: "A paid package that includes technical tests in your own skills, your level on each test, the topics to prepare and interview guidance. A strong test result counts when recruiters shortlist. Paying alone does not move you up." },
    { question: "What happens if I leave a job soon after joining?", answer: "If you leave within 60 days of joining without a serious reason, we record it on your profile and give it lower priority for 12 months. We do not charge you a fee." },
    { question: "Can I delete my data?", answer: "Yes. You can withdraw consent or ask us to delete your data at any time through the privacy request form." },
  ],
  closing: { title: "Ready to be considered?", text: "Upload your CV and a recruiter will review it against the roles we are filling." },
};
