import { env } from "cloudflare:workers";
import AuthFrame from "../auth-frame";
import { Register } from "../forms";

export const metadata = { title: "Create an account", robots: { index: false, follow: true } };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const company = kind === "company";
  // Public sign-up stays closed until the owner sets PORTAL_OPEN=true. Say so, and point to the ways in that work today.
  const open = process.env.NODE_ENV !== "production" || env.PORTAL_OPEN === "true";
  if (!open) return <AuthFrame title={company ? "Hire with Jobboard300" : "Find your next job"} intro="Account sign-up is not open to the public during the current pilot.">
    <p>{company
      ? <>Employers start with a short hiring enquiry. We call you, agree the role and the fee, and then set up your hiring account for you. <a href="/employers">Send a hiring enquiry</a>.</>
      : <>You do not need an account to be considered. Send your CV with the free form, and a recruiter contacts you if a role fits. <a href="/job-seekers">Send your CV</a>.</>}</p>
    <p className="pj-muted">Already have an account? <a href="/portal/sign-in">Sign in</a></p>
  </AuthFrame>;
  return <AuthFrame title={company ? "Hire with Jobboard300" : "Find your next job"} intro={company ? "Receive a small number of CVs that closely fit your job description." : "Free for candidates. Upload your CV once; a Jobboard300 recruiter contacts you when a role fits."}>
    <p className="pj-muted">{company ? <a href="/portal/register">I am looking for a job</a> : <a href="/portal/register?kind=company">I am hiring</a>}</p>
    <Register kind={company ? "company" : "candidate"} />
  </AuthFrame>;
}
