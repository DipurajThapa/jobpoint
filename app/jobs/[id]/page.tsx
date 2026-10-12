import { eq } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import ApplicationForm from "./application-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1); return { title: job?.title ?? "Job opportunity", description: job?.description.slice(0, 155) }; }
  catch { return { title: "Job opportunity" }; }
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let job;
  try { [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1); }
  catch { return notFound(); }
  if (!job || job.status !== "published") return notFound();
  const posting = { "@context": "https://schema.org", "@type": "JobPosting", title: job.title, description: `${job.description}\n\nRequirements: ${job.requirements}`, datePosted: job.createdAt, employmentType: job.employmentType.toUpperCase().replaceAll("-", "_"), hiringOrganization: { "@type": "Organization", name: "Job Point Consultancy" }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressRegion: "West Bengal", addressCountry: "IN" } }, industry: job.sector };
  return <main className="job-detail-page"><header className="header"><div className="container nav"><a className="brand" href="/"><Image src="/images/job-point-light.png" alt="Job Point Consultancy" width={60} height={60} /></a><a className="button button-small" href="/#jobs">All opportunities ↗</a></div></header><div className="container detail-layout"><article className="job-detail"><a className="back-link" href="/#jobs">← All open roles</a><span className="eyebrow">CURRENT OPPORTUNITY</span><h1>{job.title}</h1><p className="detail-company">{job.company} · {job.sector}</p><div className="detail-tags"><span>{job.location}</span><span>{job.employmentType}</span><span>{job.workMode}</span>{job.salaryRange&&<span>{job.salaryRange}</span>}</div><hr/><h2>About the role</h2><p>{job.description}</p>{job.requirements&&<><h2>What we’re looking for</h2><p className="requirements-text">{job.requirements}</p></>}<div className="job-note"><b>About Job Point Consultancy</b><p>Our team will review your application and contact you if your experience matches this opportunity. Your details are shared for this role only with your consent.</p></div></article><aside className="apply-card"><h2>Interested in this role?</h2><p>Send your details and our team will be in touch.</p><ApplicationForm jobId={job.id}/></aside></div><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(posting).replace(/</g,"\\u003c")}}/></main>;
}
