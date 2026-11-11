import type { Metadata } from "next";
import Link from "@/components/app-link";
import Icon from "@/components/icon";
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import { listPublicJobs } from "@/lib/public-jobs";

export const dynamic = "force-dynamic";
const title = "Latest IT & Non-IT Job Openings";
const description = "Browse published IT and non-IT openings on Jobboard300. Search by role or skill, filter by location, view job requirements and apply free with your CV.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/jobs" },
  openGraph: { title: `${title} | Jobboard300`, description, url: "/jobs", type: "website", images: ["/images/candidate-meeting.webp"] },
  twitter: { card: "summary_large_image", title, description, images: ["/images/candidate-meeting.webp"] },
};

type Search = { q?: string; location?: string; page?: string };
export default async function JobBoard({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const location = typeof search.location === "string" ? search.location.trim().slice(0, 100) : "";
  let listings: Awaited<ReturnType<typeof listPublicJobs>> | null = null;
  try { listings = await listPublicJobs(q, location, Number(search.page ?? 1)); } catch { /* Show a recoverable error, never a false empty state. */ }
  const pageLink = (page: number) => `/jobs?${new URLSearchParams({ ...(q ? { q } : {}), ...(location ? { location } : {}), page: String(page) })}#job-results`;
  const locations = Array.from(new Set([...(listings?.locations ?? []), ...(location ? [location] : [])]));
  return <div className="theme-candidate"><PublicHeader /><main>
    <section className="job-board-hero"><div className="container"><span className="eyebrow">JOBBOARD300 JOB BOARD</span><h1>Find your next IT or non-IT role.</h1><p>Explore our published openings, check the location and requirements, and apply for a role that fits your experience.</p><div className="job-board-benefits"><span><Icon name="search" /> Latest openings first</span><span><Icon name="location_on" /> Location on every role</span><span><Icon name="check_circle" /> Free to apply</span></div></div></section>
    <section className="section jobs-section job-board-results"><div className="container">
      <form className="search-bar" action="/jobs" method="get" role="search" aria-label="Search published jobs"><label><span>Role or skill</span><input name="q" defaultValue={q} maxLength={100} placeholder="Try developer, accountant, IT support…" /></label><label><span>Location</span><select name="location" defaultValue={location}><option value="">All locations</option>{locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}</select></label><button className="button" type="submit">Search jobs <Icon name="search" /></button></form>
      <div className="job-board-results-heading"><div><h2>{q || location ? "Search results" : "Latest job openings"}</h2><p>{listings ? `${listings.total} ${listings.total === 1 ? "open role" : "open roles"}${q || location ? " matching your search" : ""} · Newest first` : "Listings temporarily unavailable"}</p></div>{(q || location) && <Link className="text-link" href="/jobs">Clear filters <Icon name="close" /></Link>}</div>
      <div id="job-results" className="job-list">
        {!listings ? <div className="empty-jobs" role="alert"><h3>We couldn’t load the job board.</h3><p>Please try again to see the current openings.</p><Link className="button" href={pageLink(1)}>Retry <Icon name="refresh" /></Link></div> : listings.jobs.length ? listings.jobs.map(job => <article className={`job-card${job.featured ? " job-card-featured" : ""}`} key={job.id}><span className="job-mark" aria-hidden="true">{job.sector.slice(0, 2).toUpperCase()}</span><div className="job-main">{job.featured && <span className="job-featured-label">Featured opening</span>}<Link href={`/jobs/${encodeURIComponent(job.id)}`}><h3>{job.title}</h3></Link><p>{job.company} <span>·</span> {job.location}</p><small>{job.sector} · Posted <time dateTime={job.createdAt.slice(0, 10)}>{job.createdAt.slice(0, 10)}</time></small></div><div className="job-tags"><span>{job.employmentType}</span><span>{job.workMode}</span></div><Link className="job-link" href={`/jobs/${encodeURIComponent(job.id)}`} aria-label={`View ${job.title} and apply`}>View &amp; apply <Icon name="north_east" /></Link></article>) : <div className="empty-jobs"><span className="empty-icon"><Icon name="search" /></span><h3>{q || location ? "No roles match your search" : "No current openings published"}</h3><p>{q || location ? "Try another role or location, or clear your filters to see all published openings." : "Our published vacancies will appear here. You can register your CV for consideration for future roles."}</p>{(q || location) && <Link className="button" href="/jobs">View all jobs</Link>} <Link className="text-link" href="/job-seekers">Register your CV <Icon name="north_east" /></Link></div>}
      </div>
      {listings && listings.pageCount > 1 && <nav className="job-pagination" aria-label="Job results pages">{listings.page > 1 && <Link className="button button-quiet" href={pageLink(listings.page - 1)}>Previous</Link>}<span>Page {listings.page} of {listings.pageCount}</span>{listings.page < listings.pageCount && <Link className="button" href={pageLink(listings.page + 1)}>Next</Link>}</nav>}
      <p className="privacy-note">Applying is free. Submitting an application does not guarantee contact, an interview or a job. We share your CV with an employer only with your consent.</p>
    </div></section>
  </main><PublicFooter /></div>;
}
