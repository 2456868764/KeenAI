CREATE TABLE `roadmaps` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`public` integer DEFAULT true NOT NULL,
	`columns` text DEFAULT '[{"id":"planned","label":"Planned"},{"id":"in_progress","label":"In Progress"},{"id":"done","label":"Done"}]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_roadmaps_org_slug` ON `roadmaps` (`org_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_roadmaps_org_brand` ON `roadmaps` (`org_id`,`brand_id`);--> statement-breakpoint
CREATE TABLE `roadmap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`roadmap_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`column_id` text DEFAULT 'planned' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`linked_post_id` text,
	`eta` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`roadmap_id`) REFERENCES `roadmaps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_post_id`) REFERENCES `feedback_posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_roadmap_items_roadmap` ON `roadmap_items` (`roadmap_id`,`column_id`,`sort_order`);
