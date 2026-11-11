import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import Icon from "@/components/icon";
import Link from "@/components/app-link";

export default function AccessFrame({ kind, mode, children }: { kind: "candidate" | "company"; mode: "sign-in" | "register"; children: React.ReactNode }) {
  const company = kind === "company";
  return <div className={`account-access-page ${company ? "theme-company" : "theme-candidate"}`}>
    <PublicHeader audience={company ? "employer" : "candidate"} />
    <main className="account-access-main">
      <div className="container account-access-grid">
        <section className="account-access-intro" aria-labelledby="access-heading">
          <span className="account-access-icon"><Icon name={company ? "business" : "person"} /></span>
          <span className="eyebrow">{company ? "EMPLOYER WORKSPACE" : "CANDIDATE ACCOUNT"}</span>
          <h1 id="access-heading">{company ? "Your hiring, in one place." : "Your next step starts here."}</h1>
          <p>{company ? "Access your company's roles, submitted candidate profiles and interview updates." : "Access your profile, CV and application updates for IT and non-IT roles."}</p>
          <ul><li>{company ? "Review candidates shared by your recruiter" : "Keep your CV and profile details up to date"}</li><li>{company ? "Manage interviews and hiring progress" : "Follow your applications and messages"}</li></ul>
          <Link className="text-link" href={company ? "/employers#hiring-enquiry" : "/#jobs"}>{company ? "Send a hiring enquiry" : "Browse current jobs"}<Icon name="north_east" /></Link>
        </section>
        <section className="account-access-card" aria-labelledby="access-form-title">
          <span className="eyebrow">{company ? "FOR EMPLOYERS" : "FOR CANDIDATES"}</span>
          <h2 id="access-form-title">{company ? "Employer" : "Candidate"} {mode === "sign-in" ? "sign in" : "sign up"}</h2>
          {children}
          <div className="account-switch"><Link href={`/portal/${mode === "sign-in" ? "sign-in" : "register"}?kind=${company ? "candidate" : "company"}`}>{company ? "Looking for work? Go to candidate access" : "Hiring? Go to employer access"}<Icon name="arrow_forward" /></Link></div>
        </section>
      </div>
    </main>
    <PublicFooter />
  </div>;
}
