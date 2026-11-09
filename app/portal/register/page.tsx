import AuthFrame from "../auth-frame";
import { Register } from "../forms";

export const metadata = { title: "Create an account" };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const company = kind === "company";
  return <AuthFrame title={company ? "Hire with Jobboard300" : "Find your next job"} intro={company ? "Receive a small number of CVs that closely fit your job description." : "Free for candidates. Upload your CV once; a Jobboard300 recruiter contacts you when a role fits."}>
    <p className="pj-muted">{company ? <a href="/portal/register">I am looking for a job</a> : <a href="/portal/register?kind=company">I am hiring</a>}</p>
    <Register kind={company ? "company" : "candidate"} />
  </AuthFrame>;
}
