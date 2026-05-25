CREATE TABLE `memory_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`from_entity_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`summary_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_entity_id`) REFERENCES `memory_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `memory_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`summary_id`) REFERENCES `memory_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_relations` ON `memory_relations` (`org_id`,`from_entity_id`,`relation_type`,`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_relations_from` ON `memory_relations` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_relations_to` ON `memory_relations` (`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_relations_org_brand` ON `memory_relations` (`org_id`,`brand_id`);
