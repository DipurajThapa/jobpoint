import Link from "next/link";
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
import { SITE_URL } from "@/lib/site";
import ApplicationForm from "./application-form";

export const dynamic = "force-dynamic";

const SHARE_IMAGE = "/images/career-conversation.webp";

/** schema.org employment types that Google accepts. The stored value is free text, so anything unrecognised becomes OTHER. */
const EMPLOYMENT_TYPES: Record<string, string> = { fulltime: "FULL_TIME", parttime: "PART_TIME", contract: "CONTRACTOR", contractor: "CONTRACTOR", temporary: "TEMPORARY", temp: "TEMPORARY", internship: "INTERN", intern: "INTERN" };

const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sample = findLocalDummyJob(id);
  if (sample) return { title: `${sample.title} · Dummy reference`, description: "Fictional local development listing. No applications accepted.", alternates: { canonical: `/jobs/${encodeURIComponent(id)}` }, robots: { index: false, follow: false } };
  try {
    const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (job?.status !== "published") return { title: "Job opportunity", robots: { index: false, follow: false } };
    const path = `/jobs/${encodeURIComponent(id)}`;
    // "Junior Accountant job in Durgapur": the place is half of every job search. A remote role has no place to name.
    const title = /remote|work from home|anywhere/i.test(job.location) ? `${job.title} job (${job.location})` : `${job.title} job in ${job.location}`;
    const description = `${title} (${job.employmentType}, ${job.workMode}) through Jobboard300. Apply free with your CV; a recruiter reviews every application.`;
    const shareTitle = `${title} | Jobboard300`;
    return { title, description, alternates: { canonical: path }, openGraph: { title: shareTitle, description, url: path, type: "website", siteName: "Jobboard300", locale: "en_IN", images: [SHARE_IMAGE] }, twitter: { card: "summary_large_image", title: shareTitle, description, images: [SHARE_IMAGE] } };
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
  const noPlace = /remote|work from home|anywhere/i.test(job.location);
  const url = `${SITE_URL}/jobs/${encodeURIComponent(job.id)}`;
  // Only facts the page shows. No salary and no closing date are stated. When the employer is
  // confidential its name is not given: the recruiter, which the page names, is the organisation.
  const posting = sample || DEMO_MODE ? null : {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: job.requirements ? `${job.description}\n\nRequirements: ${job.requirements}` : job.description,
    datePosted: new Date(storedJob!.createdAt.replace(" ", "T") + (storedJob!.createdAt.includes("Z") ? "" : "Z")).toISOString(),
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
  const breadcrumbs = sample || DEMO_MODE ? null : {
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
        <span className="eyebrow">{sample ? "DUMMY · REFERENCE ONLY" : "CURRENT OPPORTUNITY"}</span>
        <h1>{job.title}</h1>
        <p className="detail-company">{job.company} · {job.sector}</p>
        <div className="detail-tags"><span>{job.location}</span><span>{job.employmentType}</span><span>{job.workMode}</span>{job.salaryRange && <span>{job.salaryRange}</span>}</div>
        <hr />
        <h2>About the role</h2><p>{job.description}</p>
        {job.requirements && <><h2>Requirements</h2><p className="requirements-text">{job.requirements}</p></>}
        <div className="job-note"><b>{sample ? "Fictional example" : "About Jobboard300"}</b><p>{sample ? "Dummy reference data for local review. This role does not exist and applications are not accepted." : DEMO_MODE ? "This is a preview of a job listing. Applications will open after the company completes its launch checks." : "Jobboard300 is a recruitment consultancy based in Kolkata. A recruiter reviews your application and contacts you if your experience matches this role. Your CV goes to the employer only with your consent."}</p></div>
      </article>
      <aside className="apply-card"><h2>{sample ? "Reference listing" : "Apply for this role"}</h2><p>{sample ? "This dummy listing is for design and search testing only. Browse other roles for a confirmed vacancy." : DEMO_MODE ? "Review the application fields in this demo. No details can be sent." : "Send your name, contact details and CV. It is free and takes about a minute, and a recruiter reviews every application."}</p>{sample ? <Link className="button" href="/#jobs">Browse roles <Icon name="north_east" /></Link> : <ApplicationForm jobId={job.id} />}</aside>
    </div>{posting && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(posting) }} />}{breadcrumbs && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />}</main>
    <PublicFooter />
  </>;
}
