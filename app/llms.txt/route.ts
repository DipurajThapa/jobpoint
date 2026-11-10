import { DEMO_MODE } from "@/lib/demo";
import { faqs } from "@/lib/faqs";

export const dynamic = "force-dynamic";

/** A plain-text summary of the site for AI assistants and answer engines (llms.txt convention). */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const body = `# Jobboard300

> Jobboard300 is a job board and recruitment consultancy for IT and non-IT white-collar roles. Candidates register a CV and apply for jobs free of charge. Employers hire recruiter-screened candidates and pay 7.5% to 8.33% of annual salary only on a successful placement, with one free replacement if the hire leaves within 60 days.

## For job seekers
- Search current jobs: ${origin}/#jobs
- Register a CV free of charge: ${origin}/#candidates
- Roles: technology and IT, finance and accounts, sales and customer support, operations, HR and administration
- A CV is shared with an employer only with the candidate's consent

## For employers
- Send a hiring requirement: ${origin}/#employers
- Services: permanent recruitment, contract and temporary staffing
- Fee: 7.5% to 8.33% of the hire's annual salary, charged only on a successful placement
- Replacement: one free replacement if the hire leaves within 60 days of joining

## Frequently asked questions
${faqs.map(f => `### ${f.question}\n${f.answer}`).join("\n\n")}

## Policies
- Privacy: ${origin}/privacy
- Terms of use: ${origin}/terms
- Privacy safeguards: ${origin}/compliance
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": DEMO_MODE ? "no-store" : "public, max-age=3600", ...(DEMO_MODE ? { "x-robots-tag": "noindex" } : {}) } });
}
