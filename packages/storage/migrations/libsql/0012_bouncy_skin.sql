CREATE TABLE `memory_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`thread_id` text,
	`summary` text NOT NULL,
	`topic` text,
	`outcome` text,
	`sentiment` text,
	`starts_at` integer,
	`ends_at` integer,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mem_ep_scope` ON `memory_episodes` (`scope`,`scope_id`,`ends_at`);--> statement-breakpoint
CREATE INDEX `idx_mem_ep_org_brand` ON `memory_episodes` (`org_id`,`brand_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memory_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`scope_key` text NOT NULL,
	`level` integer NOT NULL,
	`parent_id` text,
	`title` text,
	`summary` text NOT NULL,
	`provenance` text NOT NULL,
	`sealed_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mem_summary_scope` ON `memory_summaries` (`org_id`,`brand_id`,`scope_key`,`level`);--> statement-breakpoint
CREATE TABLE `memory_tree_buffers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`scope_key` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`leaf_ids` text DEFAULT '[]' NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_tree_buffer_scope` ON `memory_tree_buffers` (`org_id`,`brand_id`,`scope_key`,`level`);--> statement-breakpoint
CREATE INDEX `idx_mem_tree_buffer_org_brand` ON `memory_tree_buffers` (`org_id`,`brand_id`,`updated_at`);