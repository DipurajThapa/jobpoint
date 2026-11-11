-- Pilot evidence (11 Nov 2026): what an investor asks to see, recorded where the work happens.
-- 1. Every email attempt, with the address masked, so delivery and failures are visible.
CREATE TABLE email_log (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('sent','failed','not_configured')), detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX email_log_created_idx ON email_log(created_at DESC);
--> statement-breakpoint
-- 2. A signed employer mandate (the agreement to recruit for a fee).
ALTER TABLE companies ADD COLUMN mandate_signed_on TEXT;
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN mandate_reference TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- 3. Who at the employer authorised a vacancy, and when. Only authorised vacancies are published.
ALTER TABLE jds ADD COLUMN authorised_by TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE jds ADD COLUMN authorised_on TEXT;
--> statement-breakpoint
-- 4. Invoices and collections on each placement.
ALTER TABLE placements ADD COLUMN invoice_number TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE placements ADD COLUMN invoiced_on TEXT;
--> statement-breakpoint
ALTER TABLE placements ADD COLUMN collected_on TEXT;
--> statement-breakpoint
ALTER TABLE placements ADD COLUMN collected_inr INTEGER;
--> statement-breakpoint
-- 5. Recruiter time and direct costs, for cost per hire and contribution per placement.
CREATE TABLE work_log (id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, company_id TEXT, jd_id TEXT, minutes INTEGER NOT NULL CHECK(minutes > 0 AND minutes <= 960), activity TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', worked_on TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX work_log_day_idx ON work_log(worked_on);
--> statement-breakpoint
CREATE TABLE cost_log (id TEXT PRIMARY KEY NOT NULL, company_id TEXT, jd_id TEXT, kind TEXT NOT NULL, amount_inr INTEGER NOT NULL CHECK(amount_inr >= 0), note TEXT NOT NULL DEFAULT '', spent_on TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE pilot_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
