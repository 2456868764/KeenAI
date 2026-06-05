CREATE TABLE `help_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`public` integer DEFAULT true NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_help_coll_brand_slug_locale` ON `help_collections` (`brand_id`,`slug`,`locale`);--> statement-breakpoint
CREATE INDEX `idx_help_coll_org_brand` ON `help_collections` (`org_id`,`brand_id`);--> statement-breakpoint
CREATE TABLE `help_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`collection_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '{}' NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`excerpt` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`kb_document_id` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`published_at` integer,
	`author_member_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `help_collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_help_articles_brand_slug_locale` ON `help_articles` (`brand_id`,`slug`,`locale`);--> statement-breakpoint
CREATE INDEX `idx_help_articles_brand_status` ON `help_articles` (`brand_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_help_articles_collection` ON `help_articles` (`collection_id`);
