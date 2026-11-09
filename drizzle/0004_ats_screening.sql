CREATE TABLE ats_job_profiles (job_id TEXT PRIMARY KEY, requirements TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE ats_screenings (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, job_id TEXT, method TEXT NOT NULL CHECK(method IN ('rules','ai')), model TEXT, engine_version TEXT NOT NULL, cv_sha256 TEXT NOT NULL, score INTEGER NOT NULL, verdict TEXT NOT NULL CHECK(verdict IN ('strong','possible','weak','not_fit','needs_review')), profile TEXT NOT NULL, requirements TEXT NOT NULL, result TEXT NOT NULL, decision TEXT NOT NULL DEFAULT '' CHECK(decision IN ('','agree','disagree')), decision_reason TEXT NOT NULL DEFAULT '', decided_at TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL, FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE, FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL);
--> statement-breakpoint
CREATE INDEX ats_screenings_application_idx ON ats_screenings(application_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX ats_screenings_job_idx ON ats_screenings(job_id, created_at DESC);
