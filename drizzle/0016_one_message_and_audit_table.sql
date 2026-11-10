-- Merge 7: one message table and one audit table. Every existing row is copied
-- across before its old table is dropped; nothing a person sees changes.

-- 1. Messages. candidate_messages (candidate inbox), company_notices (client
--    notices) and outbound_messages (WhatsApp/email queue) become one table.
--    channel 'inbox' is what the person reads on screen; other channels are the
--    delivery queue.
CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, recipient_kind TEXT NOT NULL CHECK(recipient_kind IN ('candidate','company')), recipient_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('inbox','whatsapp','email')), kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, sender_scope TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'delivered' CHECK(status IN ('delivered','queued','sent','failed','skipped')), status_detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, read_at TEXT, sent_at TEXT);
--> statement-breakpoint
INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, title, body, status, created_at, read_at) SELECT id, 'candidate', candidate_id, 'inbox', kind, title, body, 'delivered', created_at, read_at FROM candidate_messages ORDER BY created_at, rowid;
--> statement-breakpoint
INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, title, body, status, created_at, read_at) SELECT id, 'company', company_id, 'inbox', kind, title, body, 'delivered', created_at, read_at FROM company_notices ORDER BY created_at, rowid;
--> statement-breakpoint
INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, body, sender_scope, status, status_detail, created_at, sent_at) SELECT id, recipient_kind, recipient_id, channel, kind, body, sender_scope, status, status_detail, created_at, sent_at FROM outbound_messages ORDER BY created_at, rowid;
--> statement-breakpoint
CREATE INDEX messages_recipient_idx ON messages(recipient_kind, recipient_id, channel, created_at DESC);
--> statement-breakpoint
CREATE INDEX messages_queue_idx ON messages(channel, status, created_at);
--> statement-breakpoint
-- The old tables removed a person's messages when the person or client was
-- removed (foreign key). The shared table keeps that behaviour with triggers.
CREATE TRIGGER messages_candidate_removed AFTER DELETE ON candidates BEGIN DELETE FROM messages WHERE recipient_kind = 'candidate' AND recipient_id = OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER messages_company_removed AFTER DELETE ON companies BEGIN DELETE FROM messages WHERE recipient_kind = 'company' AND recipient_id = OLD.id; END;
--> statement-breakpoint
DROP TABLE candidate_messages;
--> statement-breakpoint
DROP TABLE company_notices;
--> statement-breakpoint
DROP TABLE outbound_messages;
--> statement-breakpoint

-- 2. Audit. access_log (who viewed what) joins audit_events (who changed what).
--    kind 'change' is the existing audit trail; kind 'access' is the access log.
ALTER TABLE audit_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'change';
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN actor_kind TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN company_id TEXT;
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN jd_id TEXT;
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN candidate_ref TEXT;
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN ip_hash TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
INSERT INTO audit_events (id, kind, actor_kind, actor_id, action, target_type, target_id, detail, company_id, jd_id, candidate_ref, ip_hash, created_at) SELECT id, 'access', actor_kind, actor_id, action, 'access', COALESCE(candidate_ref, jd_id, ''), detail, company_id, jd_id, candidate_ref, ip_hash, at FROM access_log ORDER BY at, rowid;
--> statement-breakpoint
CREATE INDEX audit_events_kind_created_idx ON audit_events(kind, created_at DESC);
--> statement-breakpoint
CREATE INDEX audit_events_access_actor_idx ON audit_events(actor_id, action, created_at DESC) WHERE kind = 'access';
--> statement-breakpoint
CREATE INDEX audit_events_access_company_idx ON audit_events(company_id, created_at DESC) WHERE kind = 'access';
--> statement-breakpoint
DROP TABLE access_log;
