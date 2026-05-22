CREATE TABLE `memory_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`source` text,
	`summary_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`summary_id`) REFERENCES `memory_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_facts` ON `memory_facts` (`scope`,`scope_id`,`predicate`);--> statement-breakpoint
CREATE INDEX `idx_mem_facts_importance` ON `memory_facts` (`scope`,`scope_id`,`importance`);--> statement-breakpoint
CREATE INDEX `idx_mem_facts_org_brand` ON `memory_facts` (`org_id`,`brand_id`);--> statement-breakpoint
CREATE TABLE `memory_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_slots` ON `memory_slots` (`scope`,`scope_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_mem_slots_org_brand` ON `memory_slots` (`org_id`,`brand_id`);
