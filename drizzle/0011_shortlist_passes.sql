-- A recruiter sees the three best candidates for a job at a time. Passing on one
-- (with a reason) brings up the next. The reasons are the record used to tune matching.
CREATE TABLE shortlist_passes (
  id TEXT PRIMARY KEY NOT NULL,
  jd_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (jd_id, candidate_id)
);
--> statement-breakpoint
CREATE INDEX shortlist_passes_staff ON shortlist_passes (staff_id, jd_id, created_at);
