-- Client workspace: admin-invited client accounts and team members, managed
-- searches run by Job Point, the hiring pipeline (submissions, interviews,
-- offers, joining) and placements with their replacement-guarantee window and
-- the period in which Job Point must not approach the placed person with jobs.
ALTER TABLE companies ADD COLUMN guarantee_days INTEGER NOT NULL DEFAULT 90;
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN fee_terms TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN non_solicit_months INTEGER NOT NULL DEFAULT 12;
--> statement-breakpoint
ALTER TABLE jds ADD COLUMN service TEXT NOT NULL DEFAULT 'self' CHECK(service IN ('self','managed'));
--> statement-breakpoint
ALTER TABLE jds ADD COLUMN openings INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE company_users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE pipeline (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, jd_id TEXT NOT NULL, candidate_id TEXT NOT NULL, candidate_ref TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('release','application','job_point')), stage TEXT NOT NULL CHECK(stage IN ('submitted','shortlisted','interview','offered','offer_accepted','joined','rejected','offer_declined','no_show','withdrawn')), stage_reason TEXT NOT NULL DEFAULT '', recruiter_note TEXT NOT NULL DEFAULT '', offer_ctc_inr INTEGER, offer_date TEXT, joining_date TEXT, last_working_day TEXT, competing_offers TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(company_id, jd_id, candidate_id), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(jd_id) REFERENCES jds(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX pipeline_company_idx ON pipeline(company_id, stage, updated_at DESC);
--> statement-breakpoint
CREATE INDEX pipeline_candidate_idx ON pipeline(candidate_id);
--> statement-breakpoint
CREATE TABLE pipeline_events (id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, stage TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, FOREIGN KEY(pipeline_id) REFERENCES pipeline(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX pipeline_events_idx ON pipeline_events(pipeline_id, at);
--> statement-breakpoint
CREATE TABLE interviews (id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, company_id TEXT NOT NULL, round TEXT NOT NULL, scheduled_at TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('video','phone','in_person')), location TEXT NOT NULL DEFAULT '', interviewer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no_show')), outcome TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','advance','hold','reject')), rating INTEGER CHECK(rating BETWEEN 1 AND 5), feedback TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(pipeline_id) REFERENCES pipeline(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX interviews_company_idx ON interviews(company_id, status, scheduled_at);
--> statement-breakpoint
CREATE TABLE placements (id TEXT PRIMARY KEY, pipeline_id TEXT UNIQUE, company_id TEXT NOT NULL, candidate_id TEXT NOT NULL, jd_id TEXT NOT NULL, title TEXT NOT NULL, joined_on TEXT NOT NULL, ctc_inr INTEGER, guarantee_ends_on TEXT NOT NULL, non_solicit_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','left_in_guarantee','replaced','left')), left_on TEXT, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(pipeline_id) REFERENCES pipeline(id) ON DELETE SET NULL);
--> statement-breakpoint
CREATE INDEX placements_company_idx ON placements(company_id, joined_on DESC);
