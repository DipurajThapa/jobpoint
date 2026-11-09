-- One candidate list: website applications join the portal's candidate records.
-- 1. A fourth consent purpose, recruiter_sharing: "a Jobboard300 recruiter may
--    share my CV with an employer after reviewing the fit" (the website form's
--    wording). Narrower than share_with_companies, which also allows automatic
--    anonymous previews. SQLite cannot alter a CHECK, so the ledger is rebuilt
--    with its rows unchanged.
-- 2. candidate_sources links each website application to its candidate record.
CREATE TABLE candidate_consents_new (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('profile_processing','share_with_companies','service_offers','recruiter_sharing')), action TEXT NOT NULL CHECK(action IN ('granted','withdrawn')), notice_version TEXT NOT NULL, notice_hash TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'web', ip_hash TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
INSERT INTO candidate_consents_new (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) SELECT id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at FROM candidate_consents ORDER BY rowid;
--> statement-breakpoint
DROP TABLE candidate_consents;
--> statement-breakpoint
ALTER TABLE candidate_consents_new RENAME TO candidate_consents;
--> statement-breakpoint
CREATE INDEX candidate_consents_lookup_idx ON candidate_consents(candidate_id, purpose, at DESC);
--> statement-breakpoint
CREATE TABLE candidate_sources (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('website_application')), ref_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(kind, ref_id), FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX candidate_sources_candidate_idx ON candidate_sources(candidate_id);
