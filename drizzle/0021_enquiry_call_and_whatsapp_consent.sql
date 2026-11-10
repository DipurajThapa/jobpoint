-- Simpler public forms (11 Nov 2026).
-- 1. WhatsApp is used only with the person's own consent. The website forms
--    and the portal's CV upload record it; a candidate record keeps when it
--    was given (NULL = not given, so no WhatsApp message is queued).
ALTER TABLE applications ADD COLUMN whatsapp_consent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE candidates ADD COLUMN whatsapp_consent_at TEXT;
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN whatsapp_consent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- 2. An employer enquiry can ask for a call with a consultant at a chosen time.
--    meeting_at is the start of a 30-minute slot (UTC). One open request per slot.
ALTER TABLE employer_enquiries ADD COLUMN meeting_at TEXT;
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN meeting_status TEXT NOT NULL DEFAULT 'none' CHECK(meeting_status IN ('none','requested','confirmed','done','cancelled'));
--> statement-breakpoint
CREATE UNIQUE INDEX employer_enquiries_meeting_slot ON employer_enquiries(meeting_at) WHERE meeting_at IS NOT NULL AND meeting_status IN ('requested','confirmed');
--> statement-breakpoint
-- 3. What happened to the acknowledgement sent after the form: 'sent',
--    'not_configured', 'failed', 'queued', 'no_consent' or '' (older rows).
ALTER TABLE employer_enquiries ADD COLUMN ack_email TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN ack_whatsapp TEXT NOT NULL DEFAULT '';
