ALTER TABLE `applications` ADD `desired_role` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `skills` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `education` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `availability` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `share_consent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `future_consent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `privacy_version` text DEFAULT '2026-10-13' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `consent_at` text;
--> statement-breakpoint
ALTER TABLE `applications` ADD `recruiter_notes` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `updated_at` text DEFAULT '2026-10-13 00:00:00' NOT NULL;
--> statement-breakpoint
CREATE INDEX `applications_email_idx` ON `applications` (`email`);
--> statement-breakpoint
CREATE INDEX `applications_location_idx` ON `applications` (`location`);
--> statement-breakpoint
ALTER TABLE `employer_enquiries` ADD `privacy_version` text DEFAULT '2026-10-13' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employer_enquiries` ADD `consent_at` text;
--> statement-breakpoint
ALTER TABLE `employer_enquiries` ADD `updated_at` text DEFAULT '2026-10-13 00:00:00' NOT NULL;
--> statement-breakpoint
CREATE TABLE `privacy_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `request_type` text NOT NULL,
  `requester_name` text NOT NULL,
  `email` text NOT NULL,
  `details` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'new' NOT NULL,
  `resolution_note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `privacy_requests_status_idx` ON `privacy_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);
