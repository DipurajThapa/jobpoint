-- Fixes from the 10 Nov 2026 audit.
-- 1. A verified deletion request is carried out from the request itself; the
--    request records when the data was erased and what was removed.
ALTER TABLE privacy_requests ADD COLUMN erased_at TEXT;
--> statement-breakpoint
ALTER TABLE privacy_requests ADD COLUMN erasure_summary TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- 2. The limit on changing a live job's requirements is counted from its own
--    table, not from the wording of audit log entries.
CREATE TABLE jd_requirement_edits (id TEXT PRIMARY KEY NOT NULL, jd_id TEXT NOT NULL, edited_by TEXT NOT NULL, at TEXT NOT NULL, FOREIGN KEY(jd_id) REFERENCES jds(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX jd_requirement_edits_idx ON jd_requirement_edits(jd_id, at);
--> statement-breakpoint
-- Carry over the edits already counted, so the limit does not reset.
INSERT INTO jd_requirement_edits (id, jd_id, edited_by, at) SELECT e.id, e.target_id, e.actor_id, replace(e.created_at, ' ', 'T') || 'Z' FROM audit_events e WHERE e.action = 'jd.edited' AND e.detail LIKE 'was live%' AND EXISTS (SELECT 1 FROM jds j WHERE j.id = e.target_id);
