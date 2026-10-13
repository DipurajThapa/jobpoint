/** Local development references only. These are fictional and never enter D1 or a production build. */
export const dummyJobs = [
  { id: "dummy-operations-coordinator", title: "Operations Coordinator", company: "Dummy Company (reference)", location: "Durgapur", employmentType: "Full-time", workMode: "On-site", sector: "Operations", salaryRange: null, description: "Dummy reference listing. Coordinate schedules, records and day-to-day operations for a fictional team. This is not a live vacancy.", requirements: "Example requirements: clear communication, spreadsheet skills and attention to detail." },
  { id: "dummy-customer-support-associate", title: "Customer Support Associate", company: "Dummy Company (reference)", location: "Kolkata", employmentType: "Full-time", workMode: "Hybrid", sector: "Customer support", salaryRange: null, description: "Dummy reference listing. Answer customer queries and keep accurate follow-up notes for a fictional employer. This is not a live vacancy.", requirements: "Example requirements: customer service experience, written communication and problem-solving." },
  { id: "dummy-junior-accountant", title: "Junior Accountant", company: "Dummy Company (reference)", location: "Durgapur", employmentType: "Full-time", workMode: "On-site", sector: "Finance & accounting", salaryRange: null, description: "Dummy reference listing. Assist with reconciliations, invoices and monthly reporting for a fictional employer. This is not a live vacancy.", requirements: "Example requirements: basic accounting knowledge and comfort with spreadsheets." },
  { id: "dummy-sales-executive", title: "Sales Executive", company: "Dummy Company (reference)", location: "Asansol", employmentType: "Contract", workMode: "On-site", sector: "Sales", salaryRange: null, description: "Dummy reference listing. Build a customer pipeline and prepare follow-up reports for a fictional employer. This is not a live vacancy.", requirements: "Example requirements: relationship-building, communication and local travel availability." },
] as const;

export function findLocalDummyJob(id: string) {
  return process.env.NODE_ENV === "development" ? dummyJobs.find(job => job.id === id) : undefined;
}

export function searchLocalDummyJobs(q = "", location = "") {
  if (process.env.NODE_ENV !== "development") return [];
  const needle = q.trim().toLocaleLowerCase("en-IN");
  return dummyJobs.filter(job => (!location || job.location === location) &&
    (!needle || [job.title, job.sector, job.description].some(value => value.toLocaleLowerCase("en-IN").includes(needle))));
}

export function localDummyListings(q = "", location = "") {
  return {
    jobs: searchLocalDummyJobs(q, location).map(job => ({
      id: job.id, title: job.title, company: job.company, location: job.location,
      employmentType: job.employmentType, workMode: job.workMode, sector: job.sector, isDummy: true,
    })),
    locations: process.env.NODE_ENV === "development"
      ? [...new Set(dummyJobs.map(job => job.location))].sort() : [],
  };
}
