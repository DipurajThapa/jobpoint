import { DEMO_MODE } from "./demo";

/** Homepage copy and structured data share one source of truth. */
export const faqs = [
  { question: "What is Jobboard300?", answer: "Jobboard300 is a job board and recruitment consultancy based in Kolkata, West Bengal. Candidates use it to find IT jobs in India. Employers use it to hire screened candidates through a recruiter." },
  { question: "Is Jobboard300 free for job seekers?", answer: "Yes. Registering your CV and applying for jobs are free. We never charge a candidate for being considered for a role." },
  { question: "How do I apply for an IT job?", answer: DEMO_MODE ? "Browse confirmed roles and preview the application fields. Applications and CV uploads are disabled during the public demo." : "Search the current openings, open a role to read the details and apply with your CV. If no role fits today, register your CV and we will consider you for new openings." },
  { question: "Which roles does Jobboard300 recruit for?", answer: "Mostly technology roles: software developers, data analysts and engineers, cloud and DevOps engineers, testers and IT support staff. We also fill the operations, sales and finance roles around those teams." },
  { question: "How much does it cost to hire through Jobboard300?", answer: DEMO_MODE ? "You can preview the employer enquiry form. Submissions open after the company completes its launch checks." : "Sending a requirement and reviewing a shortlist cost nothing. You pay a fee, agreed in advance as a percentage of the hire's annual salary, only when the person joins." },
  { question: "What happens if a new hire leaves?", answer: "Every placement carries a 60-day replacement guarantee. If the person leaves within 60 days of joining, we find a replacement for the same role at no extra fee." },
  { question: "Will you share my CV with employers?", answer: "Only with your consent, and only for a role that suits you. You can withdraw consent or ask us to delete your data at any time." },
  { question: "How does Jobboard300 protect my data?", answer: "Employers see a candidate's profile only while they are interviewing that person, and contact details only at offer stage. Every downloaded CV is watermarked so that a copy can be traced." },
  { question: "Are hiring decisions made automatically?", answer: "No. Software reads and sorts CVs, a recruiter reviews every match, and the employer makes the hiring decision." },
];
