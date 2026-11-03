CREATE TABLE `platform_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`password_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_sign_in_at` text,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_users_email_unique` ON `platform_users` (`email`);
--> statement-breakpoint
CREATE TABLE `platform_tool_access` (
	`user_id` text NOT NULL,
	`tool_key` text NOT NULL,
	`level` text NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `tool_key`),
	FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platform_sessions_user_idx` ON `platform_sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `platform_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platform_tokens_user_idx` ON `platform_tokens` (`user_id`, `purpose`);
--> statement-breakpoint
CREATE TABLE `email_kit_records` (
	`tbl` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_rev` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`tbl`, `id`)
);
--> statement-breakpoint
CREATE TABLE `email_kit_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	`last_tx` text DEFAULT '' NOT NULL,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
INSERT INTO `email_kit_state` (`id`, `rev`, `last_tx`) VALUES (1, 0, '');
--> statement-breakpoint
CREATE TABLE `email_kit_files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`size` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_kit_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD `detail` text DEFAULT '' NOT NULL;
