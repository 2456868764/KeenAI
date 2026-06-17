CREATE TABLE `changelog_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`content` text DEFAULT '{}' NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`category_tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`scheduled_at` integer,
	`audience_filter` text DEFAULT '{"segments":[]}' NOT NULL,
	`author_member_id` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_changelog_brand_slug` ON `changelog_entries` (`brand_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_changelog_brand_status` ON `changelog_entries` (`brand_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_changelog_org_brand` ON `changelog_entries` (`org_id`,`brand_id`);
