-- Where an application or an enquiry came from (11 Nov 2026): the campaign tags on
-- the link the person followed (utm_source, utm_medium, utm_campaign), the site
-- that referred them (host name only) and the first page they opened. No cookies
-- and no visitor identifier are used; the values are held in the browser tab
-- until a form is sent.
ALTER TABLE applications ADD COLUMN source TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN medium TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN campaign TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN referrer TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN landing TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN source TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN medium TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN campaign TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN referrer TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN landing TEXT NOT NULL DEFAULT '';
