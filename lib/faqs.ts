import { DEMO_MODE } from "./demo";

/** Homepage copy and structured data share one source of truth. */
export const faqs = [
  { question: "What does Job Point Consultancy do?", answer: "We support employers with recruitment and help candidates explore suitable opportunities through role briefing, candidate review and interview coordination." },
  { question: "How do I apply for a job?", answer: DEMO_MODE ? "Browse confirmed roles and preview the application fields. Applications and CV uploads are disabled during the public demo." : "Browse current openings, open a role to review its details and submit your application. If no role fits, register your CV for relevant opportunities." },
  { question: "Can employers request help with a vacancy?", answer: DEMO_MODE ? "You can preview the employer enquiry form. Submissions open after the company completes its launch checks." : "Yes. Share the role, location and requirements using the employer enquiry form. A consultant will follow up to discuss the scope." },
  { question: "Will you share my CV with employers?", answer: "The current demo cannot receive a CV. During live recruitment, we share a CV for a suitable role only with the candidate's consent." },
  { question: "Are decisions made automatically?", answer: "No. Technology helps manage applications, but people review candidate information and employers make their own hiring decisions." },
];
