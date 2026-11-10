-- Placement-fee model: a percentage of annual salary on joining, 60-day replacement.
ALTER TABLE companies ADD COLUMN fee_percent REAL NOT NULL DEFAULT 8.33;
--> statement-breakpoint
UPDATE companies SET guarantee_days = 60 WHERE guarantee_days = 90;
--> statement-breakpoint
ALTER TABLE placements ADD COLUMN fee_percent REAL;
--> statement-breakpoint
ALTER TABLE placements ADD COLUMN fee_inr INTEGER;
--> statement-breakpoint
-- Every open job is recruited by Jobboard300; clients no longer browse matches.
UPDATE jds SET service = 'managed' WHERE status != 'closed';
--> statement-breakpoint
-- Employers a candidate wants to stay hidden from, as typed by the candidate (the client list is never shown).
ALTER TABLE candidates ADD COLUMN hidden_company_names TEXT NOT NULL DEFAULT '[]';
