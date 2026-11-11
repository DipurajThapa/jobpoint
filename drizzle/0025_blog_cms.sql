-- Admin blog drafts, live snapshots and private media metadata.
CREATE TABLE `blog_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_json` text NOT NULL,
	`published_json` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_at` text,
	`updated_at` text NOT NULL,
	`published_updated_at` text,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);
