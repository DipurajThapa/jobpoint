-- Merge 6: link employers. No data is moved or removed.
-- 1. An employer enquiry records the client it became.
ALTER TABLE employer_enquiries ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX employer_enquiries_company_idx ON employer_enquiries(company_id);
--> statement-breakpoint
-- 2. A client records the Email Kit organisation it was reached through, so
--    outreach history and the client account are one click apart.
ALTER TABLE companies ADD COLUMN email_kit_org_id TEXT;
--> statement-breakpoint
CREATE INDEX companies_email_kit_org_idx ON companies(email_kit_org_id);
