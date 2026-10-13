import { DEMO_MODE } from "@/lib/demo";
import { findLocalDummyJob } from "@/lib/local-dummy-jobs";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import Icon from "@/components/icon";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import ApplicationForm from "./application-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sample = findLocalDummyJob(id);
  if (sample) return { title: `${sample.title} · Dummy reference`, description: "Fictional local development listing. No applications accepted.", alternates: { canonical: `/jobs/${encodeURIComponent(id)}` }, robots: { index: false, follow: false } };
  try {
    const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (job?.status !== "published") return { title: "Job opportunity", robots: { index: false, follow: false } };
    const path = `/jobs/${encodeURIComponent(id)}`;
    const description = job.description.slice(0, 155);
    return { title: job.title, description, alternates: { canonical: path }, openGraph: { title: job.title, description, url: path, type: "website" } };
  } catch { return { title: "Job opportunity", robots: { index: false, follow: false } }; }
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = findLocalDummyJob(id);
  let storedJob: typeof jobs.$inferSelect | undefined;
  if (!sample) {
    try { [storedJob] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1); }
    catch { return notFound(); }
    if (storedJob?.status !== "published") return notFound();
  }
  const job = sample ?? storedJob!;
  const posting = sample || DEMO_MODE || storedJob!.company === "Confidential client" ? null : {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: `${job.description}\n\nRequirements: ${job.requirements}`,
    datePosted: new Date(storedJob!.createdAt.replace(" ", "T") + (storedJob!.createdAt.includes("Z") ? "" : "Z")).toISOString(),
    employmentType: job.employmentType.toUpperCase().replaceAll("-", "_"),
    hiringOrganization: { "@type": "Organization", name: job.company },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" } },
    industry: job.sector,
  };
  return <>
    <PublicHeader />
    <main className="job-detail-page"><div className="container detail-layout">
      <article className="job-detail">
        <a className="back-link" href="/#jobs"><Icon name="arrow_back" /> All roles</a>
        <span className="eyebrow">{sample ? "DUMMY · REFERENCE ONLY" : "CURRENT OPPORTUNITY"}</span>
        <h1>{job.title}</h1>
        <p className="detail-company">{job.company} · {job.sector}</p>
        <div className="detail-tags"><span>{job.location}</span><span>{job.employmentType}</span><span>{job.workMode}</span>{job.salaryRange && <span>{job.salaryRange}</span>}</div>
        <hr />
        <h2>About the role</h2><p>{job.description}</p>
        {job.requirements && <><h2>What we’re looking for</h2><p className="requirements-text">{job.requirements}</p></>}
        <div className="job-note"><b>{sample ? "Fictional example" : "About Job Point Consultancy"}</b><p>{sample ? "Dummy reference data for local review. This role does not exist and applications are not accepted." : DEMO_MODE ? "This is a preview of a job listing. Applications will open after the company completes its launch checks." : "Our team will review your application and contact you if your experience matches this opportunity. Your details are shared for this role only with your consent."}</p></div>
      </article>
      <aside className="apply-card"><h2>{sample ? "Reference listing" : "Interested in this role?"}</h2><p>{sample ? "This dummy listing is for design and search testing only. Browse other roles for a confirmed vacancy." : DEMO_MODE ? "Review the application fields in this demo. No details can be sent." : "Send your details and our team will be in touch."}</p>{sample ? <a className="button" href="/#jobs">Browse roles <Icon name="north_east" /></a> : <ApplicationForm jobId={job.id} />}</aside>
    </div>{posting && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(posting).replace(/</g, "\\u003c") }} />}</main>
    <PublicFooter />
  </>;
}
