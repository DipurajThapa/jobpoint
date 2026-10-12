CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company` text DEFAULT 'Confidential client' NOT NULL,
	`location` text NOT NULL,
	`employment_type` text NOT NULL,
	`work_mode` text DEFAULT 'On-site' NOT NULL,
	`sector` text DEFAULT 'Other' NOT NULL,
	`salary_range` text,
	`description` text NOT NULL,
	`requirements` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_created_idx` ON `jobs` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `jobs_location_idx` ON `jobs` (`location`);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`location` text NOT NULL,
	`experience` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`resume_key` text,
	`resume_name` text,
	`resume_type` text,
	`resume_size` integer,
	`consent` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applications_job_created_idx` ON `applications` (`job_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);
--> statement-breakpoint
CREATE TABLE `employer_enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_name` text NOT NULL,
	`company` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`role_title` text NOT NULL,
	`location` text NOT NULL,
	`headcount` integer DEFAULT 1 NOT NULL,
	`details` text NOT NULL,
	`consent` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `enquiries_status_created_idx` ON `employer_enquiries` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL
);
