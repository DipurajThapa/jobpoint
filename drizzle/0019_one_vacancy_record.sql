-- Merge 2: one vacancy record and one pipeline.
-- A website role (jobs) is now the website listing of a client job (jds) with
-- the same id; the vacancy records are created by the application, because the
-- job requirements are parsed from the role's wording. Candidates are worked in
-- the Recruiting tool, so the owner console's separate CV screening is retired.
-- Its two tables are renamed, not dropped (see 0017).
ALTER TABLE ats_screenings RENAME TO retired_ats_screenings;
--> statement-breakpoint
ALTER TABLE ats_job_profiles RENAME TO retired_ats_job_profiles;
