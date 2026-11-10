-- Two-step sign-in for staff accounts (authenticator app codes). Optional per
-- person: nothing changes for an account until its owner turns it on.
-- The secret is stored encrypted; recovery codes are stored as hashes.
ALTER TABLE platform_users ADD COLUMN totp_secret TEXT;
--> statement-breakpoint
ALTER TABLE platform_users ADD COLUMN totp_enabled_at TEXT;
--> statement-breakpoint
ALTER TABLE platform_users ADD COLUMN totp_last_counter INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE platform_users ADD COLUMN totp_recovery TEXT NOT NULL DEFAULT '[]';
