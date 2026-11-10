-- Notifications: the candidate inbox, client notices, and an outbound queue
-- that a WhatsApp (or other) provider can be plugged into later. No provider
-- is called today: outbound rows are recorded as 'queued' or 'skipped'.
CREATE TABLE candidate_messages (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX candidate_messages_idx ON candidate_messages(candidate_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE company_notices (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX company_notices_idx ON company_notices(company_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE messaging_settings (scope TEXT PRIMARY KEY, whatsapp_number TEXT NOT NULL DEFAULT '', whatsapp_enabled INTEGER NOT NULL DEFAULT 0, admin_override INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE outbound_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL CHECK(channel IN ('whatsapp','email')), recipient_kind TEXT NOT NULL CHECK(recipient_kind IN ('candidate','company')), recipient_id TEXT NOT NULL, sender_scope TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','sent','failed','skipped')), status_detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, sent_at TEXT);
--> statement-breakpoint
CREATE INDEX outbound_messages_status_idx ON outbound_messages(status, created_at);
--> statement-breakpoint
CREATE INDEX outbound_messages_recipient_idx ON outbound_messages(recipient_kind, recipient_id);
