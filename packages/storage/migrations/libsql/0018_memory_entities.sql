CREATE TABLE `memory_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`summary_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`summary_id`) REFERENCES `memory_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_entities` ON `memory_entities` (`org_id`,`scope`,`scope_id`,`entity_type`,`name`);--> statement-breakpoint
CREATE INDEX `idx_mem_entities_org_brand` ON `memory_entities` (`org_id`,`brand_id`);
