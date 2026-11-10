-- Open audit items (11 Nov 2026).
-- 1. A message can carry its own link (stored as a path on this site, so it works on any address).
ALTER TABLE messages ADD COLUMN link TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- 2. A replacement hire is linked to the placement it replaces.
ALTER TABLE placements ADD COLUMN replaces_placement_id TEXT;
--> statement-breakpoint
-- 3. What the client did, for Jobboard300's recruiters ("What changed"). No names are stored: the
--    person is read through pipeline_id while they still exist.
CREATE TABLE staff_updates (id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL, jd_id TEXT, pipeline_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX staff_updates_company_idx ON staff_updates(company_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE staff_updates_seen (user_id TEXT PRIMARY KEY NOT NULL, seen_at TEXT NOT NULL);
--> statement-breakpoint
-- 4. Who recorded an interview's result (the client, or Jobboard300 on the client's behalf).
ALTER TABLE interviews ADD COLUMN recorded_by TEXT NOT NULL DEFAULT '';
