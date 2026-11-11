import { env } from "cloudflare:workers";
import AccessFrame from "../access-frame";
import { Register } from "../forms";
import Link from "@/components/app-link";

export const metadata = { title: "Create an account", robots: { index: false, follow: true } };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const company = kind === "company";
  const open = process.env.NODE_ENV !== "production" || env.PORTAL_OPEN === "true";
  return <AccessFrame kind={company ? "company" : "candidate"} mode="register">
    {open ? <Register kind={company ? "company" : "candidate"} /> : <div className="pj-list">
      <p className="pj-notice">Public account sign-up is not open yet.</p>
      <p>{company ? "You can send your hiring requirements without an account. Account access is arranged separately if we proceed with your enquiry." : "You can register your CV or apply for a published job without an account. Submitting a CV does not guarantee contact, an interview or a job."}</p>
      <Link className="wp-btn" href={company ? "/employers#hiring-enquiry" : "/job-seekers"}>{company ? "Send a hiring enquiry" : "Register your CV"}</Link>
      <p className="pj-muted">Already have an account? <Link href={`/portal/sign-in?kind=${company ? "company" : "candidate"}`}>Sign in</Link></p>
    </div>}
  </AccessFrame>;
}
