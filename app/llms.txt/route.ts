import { DEMO_MODE } from "@/lib/demo";
import { faqs } from "@/lib/faqs";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** A plain-text summary of the site for AI assistants and answer engines (llms.txt convention). */
export async function GET() {
  // Same address as the canonical links, whichever host the request arrived on.
  const origin = SITE_URL;
  const body = `# Jobboard300

> Jobboard300 is a job board and recruitment consultancy based in Kolkata, India, for IT and other office-based (white-collar) roles. Job seekers register a CV and apply for jobs free of charge. Employers send an enquiry, speak to a consultant and hire recruiter-screened candidates. Employers pay a placement fee of 7.5% to 8.33% of the hired person's annual salary, only when that person joins.

## Key facts
- What it is: a job board and recruitment consultancy (placement agency)
- Where it is based: Kolkata, West Bengal, India
- Roles: technology and IT; finance and accounts; sales and customer support; operations, HR and administration
- Cost to job seekers: nothing to register a CV, apply or be placed. Fast Track is an optional paid package of skill tests and interview guidance.
- Cost to employers: 7.5% to 8.33% of the hire's annual salary, agreed in advance, payable when the hire joins. No charge for an enquiry, a call, a shortlist or interviews.
- Replacement for employers: one free replacement for the same role if the hire leaves within 60 days of joining. Conditions are in the terms for employers.
- Privacy: a CV is shared with an employer only with the candidate's consent. Employers cannot search the candidate database and see contact details only at offer stage.
- Decisions: software reads and sorts CVs, a recruiter reviews every match, and the employer makes the hiring decision.

## For job seekers
- Page for job seekers: ${origin}/job-seekers
- Search current jobs: ${origin}/#jobs
- To register: name, email, mobile number and a CV (PDF or DOCX, up to 5 MB), and two required ticks: acceptance of the terms for job seekers, and consent to store and use the CV. Skills and experience are read from the CV.
- After registering: the page shows a reference number. A recruiter reviews the CV and contacts the person when a role fits.
- A CV is shared with an employer only with the candidate's consent
- Terms for job seekers: ${origin}/terms/job-seekers

## For employers
- Page for employers: ${origin}/employers
- To start: a short enquiry (name, company, work email, phone and a message). No job description is needed. A 30-minute call with a consultant can be requested from the next day, Monday to Saturday, 10 am to 6 pm India time (not 1 pm to 2 pm); a consultant confirms the time or offers another.
- Before candidates are submitted: a signed recruitment services agreement
- Service: permanent recruitment (contract and temporary staffing are not offered)
- Fee: 7.5% to 8.33% of the hire's annual salary, payable only when the hire joins
- Replacement: one free replacement if the hire leaves within 60 days of joining
- Terms for employers: ${origin}/terms/employers

## Frequently asked questions
${faqs.map(f => `### ${f.question}\n${f.answer}`).join("\n\n")}

## Policies
- Privacy notice: ${origin}/privacy
- Terms of use: ${origin}/terms
- Privacy safeguards: ${origin}/compliance
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": DEMO_MODE ? "no-store" : "public, max-age=3600", ...(DEMO_MODE ? { "x-robots-tag": "noindex" } : {}) } });
}
