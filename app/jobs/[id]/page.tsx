import Link from "@/components/app-link";
import { DEMO_MODE } from "@/lib/demo";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import Icon from "@/components/icon";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { SITE_URL } from "@/lib/site";
import ApplicationForm from "./application-form";

export const dynamic = "force-dynamic";

const SHARE_IMAGE = "/images/candidate-meeting.webp";

/** schema.org employment types that Google accepts. The stored value is free text, so anything unrecognised becomes OTHER. */
const EMPLOYMENT_TYPES: Record<string, string> = { fulltime: "FULL_TIME", parttime: "PART_TIME", contract: "CONTRACTOR", contractor: "CONTRACTOR", temporary: "TEMPORARY", temp: "TEMPORARY", internship: "INTERN", intern: "INTERN" };

const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (job?.status !== "published") return { title: "Job opportunity", robots: { index: false, follow: false } };
    const path = `/jobs/${encodeURIComponent(id)}`;
    // Include a job location when one is provided. A remote role may have no specific city.
    const title = /remote|work from home|anywhere/i.test(job.location) ? `${job.title} job (${job.location})` : `${job.title} job in ${job.location}`;
    const description = `${title} (${job.employmentType}, ${job.workMode}) through Jobboard300. Apply free with your CV; a recruiter contacts you if you fit.`;
    const shareTitle = `${title} | Jobboard300`;
    return { title, description, alternates: { canonical: path }, openGraph: { title: shareTitle, description, url: path, type: "website", siteName: "Jobboard300", locale: "en_IN", images: [SHARE_IMAGE] }, twitter: { card: "summary_large_image", title: shareTitle, description, images: [SHARE_IMAGE] } };
  } catch { return { title: "Job opportunity", robots: { index: false, follow: false } }; }
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let storedJob: typeof jobs.$inferSelect | undefined;
  try { [storedJob] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1); }
  catch { return notFound(); }
  if (storedJob?.status !== "published") return notFound();
  const job = storedJob;
  const noPlace = /remote|work from home|anywhere/i.test(job.location);
  const url = `${SITE_URL}/jobs/${encodeURIComponent(job.id)}`;
  // Only facts the page shows. No salary and no closing date are stated. When the employer is
  // confidential its name is not given: the recruiter, which the page names, is the organisation.
  const posting = DEMO_MODE ? null : {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: job.requirements ? `${job.description}\n\nRequirements: ${job.requirements}` : job.description,
    datePosted: new Date(storedJob.createdAt.replace(" ", "T") + (storedJob.createdAt.includes("Z") ? "" : "Z")).toISOString(),
    employmentType: EMPLOYMENT_TYPES[job.employmentType.toLowerCase().replace(/[^a-z]/g, "")] ?? "OTHER",
    hiringOrganization: job.company === "Confidential client"
      ? { "@type": "EmploymentAgency", "@id": `${SITE_URL}/#agency`, name: "Jobboard300", url: SITE_URL }
      : { "@type": "Organization", name: job.company },
    // A role whose "location" is the word Remote has no place to name.
    ...(noPlace ? {} : { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" } } }),
    ...(job.workMode === "Remote" || noPlace ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "India" } } : {}),
    industry: job.sector,
    url, identifier: { "@type": "PropertyValue", name: "Jobboard300", value: job.id }, directApply: true,
  };
  const breadcrumbs = DEMO_MODE ? null : {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Jobboard300", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Current jobs", item: `${SITE_URL}/#jobs` },
      { "@type": "ListItem", position: 3, name: job.title, item: url },
    ],
  };
  return <>
    <PublicHeader />
    <main className="job-detail-page"><div className="container detail-layout">
      <article className="job-detail">
        <Link className="back-link" href="/#jobs"><Icon name="arrow_back" /> All current jobs</Link>
        <span className="eyebrow">CURRENT OPPORTUNITY</span>
        <h1>{job.title}</h1>
        <p className="detail-company">{job.company} · {job.sector}</p>
        <div className="detail-tags"><span>{job.location}</span><span>{job.employmentType}</span><span>{job.workMode}</span>{job.salaryRange && <span>{job.salaryRange}</span>}</div>
        <hr />
        <h2>About the role</h2><p>{job.description}</p>
        {job.requirements && <><h2>Requirements</h2><p className="requirements-text">{job.requirements}</p></>}
        <div className="job-note"><b>About Jobboard300</b><p>{DEMO_MODE ? "This is a preview of a job listing. Applications will open after the company completes its launch checks." : "Jobboard300 is a recruitment consultancy. A recruiter reviews applications for this role and contacts you only if your experience fits. Your CV goes to the employer only with your consent. Applying is free."}</p></div>
      </article>
      <aside className="apply-card"><h2>Apply for this role</h2><p>{DEMO_MODE ? "Review the application fields in this demo. No details can be sent." : "Send your name, contact details and CV. Applying is free. Submitting a CV does not guarantee contact, an interview or a job."}</p><ApplicationForm jobId={job.id} /></aside>
    </div>{posting && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(posting) }} />}{breadcrumbs && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />}</main>
    <PublicFooter />
  </>;
}
