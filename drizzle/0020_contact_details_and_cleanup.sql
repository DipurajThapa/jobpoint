-- 1. A candidate record carries the person's email and phone, so Jobboard300 can
--    reach them. (Until now only a one-way match code was kept on the record and
--    the contact details sat on the account, the website form or inside the CV.)
ALTER TABLE candidates ADD COLUMN email TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE candidates ADD COLUMN phone TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE candidates SET email = COALESCE((SELECT a.email FROM portal_accounts a WHERE a.id = candidates.account_id), ''), phone = COALESCE((SELECT a.phone FROM portal_accounts a WHERE a.id = candidates.account_id), '') WHERE account_id IS NOT NULL AND status NOT IN ('merged','deleted');
--> statement-breakpoint
UPDATE candidates SET email = COALESCE((SELECT a.email FROM applications a JOIN candidate_sources s ON s.kind = 'website_application' AND s.ref_id = a.id WHERE s.candidate_id = candidates.id ORDER BY a.created_at DESC LIMIT 1), ''), phone = COALESCE((SELECT a.phone FROM applications a JOIN candidate_sources s ON s.kind = 'website_application' AND s.ref_id = a.id WHERE s.candidate_id = candidates.id ORDER BY a.created_at DESC LIMIT 1), '') WHERE account_id IS NULL AND status NOT IN ('merged','deleted');
--> statement-breakpoint
CREATE INDEX candidates_email_idx ON candidates(email);
--> statement-breakpoint

-- 2. Merge 3: self-service mode is removed. Every job is a managed search; plans,
--    subscriptions and the unlock quota go. `releases` and `unlocks` stay: they
--    are the record of which client was shown which candidate by a recruiter.
UPDATE jds SET service = 'managed';
--> statement-breakpoint
UPDATE company_parameters SET status = 'rejected', decision_note = 'Self-service mode removed' WHERE status = 'requested';
--> statement-breakpoint
DROP TABLE quota_ledger;
--> statement-breakpoint
DROP TABLE company_subscriptions;
--> statement-breakpoint
DROP TABLE plans;
--> statement-breakpoint

-- 3. The tables retired by merges 2, 4 and 5 are dropped. The owner confirmed on
--    10 Nov 2026 that the site holds no live data.
DROP TABLE retired_assessment_responses;
--> statement-breakpoint
DROP TABLE retired_assessment_attempts;
--> statement-breakpoint
DROP TABLE retired_assessment_items;
--> statement-breakpoint
DROP TABLE retired_assessments;
--> statement-breakpoint
DROP TABLE retired_service_enrolments;
--> statement-breakpoint
DROP TABLE retired_service_orders;
--> statement-breakpoint
DROP TABLE retired_services;
--> statement-breakpoint
DROP TABLE retired_payment_intents;
--> statement-breakpoint
DROP TABLE retired_ats_screenings;
--> statement-breakpoint
DROP TABLE retired_ats_job_profiles;
