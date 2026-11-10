import { DEMO_MODE } from "@/lib/demo";
import { faqs } from "@/lib/faqs";

export const dynamic = "force-dynamic";

/** A plain-text summary of the site for AI assistants and answer engines (llms.txt convention). */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const body = `# Jobboard300

> Jobboard300 is a job board and IT recruitment consultancy based in Kolkata, West Bengal, India. Candidates find IT jobs across India and register a CV free of charge. Employers hire recruiter-screened candidates and pay a placement fee only when the hire joins, with a 60-day replacement guarantee.

## For job seekers
- Search current IT jobs: ${origin}/#jobs
- Register a CV free of charge: ${origin}/#candidates
- Roles: software development, data and AI, cloud and DevOps, testing and IT support
- A CV is shared with an employer only with the candidate's consent

## For employers
- Send a hiring requirement: ${origin}/#employers
- Services: permanent IT recruitment, contract and temporary staffing
- Fee: an agreed percentage of the hire's annual salary, charged on joining
- Guarantee: a replacement at no extra fee if the hire leaves within 60 days

## Frequently asked questions
${faqs.map(f => `### ${f.question}\n${f.answer}`).join("\n\n")}

## Policies
- Privacy: ${origin}/privacy
- Terms of use: ${origin}/terms
- Privacy safeguards: ${origin}/compliance
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": DEMO_MODE ? "no-store" : "public, max-age=3600", ...(DEMO_MODE ? { "x-robots-tag": "noindex" } : {}) } });
}
