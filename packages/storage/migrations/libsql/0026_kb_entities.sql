CREATE TABLE `kb_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`description` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`chunk_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_kb_entities` ON `kb_entities` (`org_id`,`brand_id`,`entity_type`,`name`);--> statement-breakpoint
CREATE INDEX `idx_kb_entities_org_brand` ON `kb_entities` (`org_id`,`brand_id`);--> statement-breakpoint
CREATE TABLE `kb_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`from_entity_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`evidence_chunk_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_entity_id`) REFERENCES `kb_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_entity_id`) REFERENCES `kb_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_kb_relations` ON `kb_relations` (`org_id`,`from_entity_id`,`relation_type`,`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_relations_from` ON `kb_relations` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_relations_to` ON `kb_relations` (`to_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_relations_org_brand` ON `kb_relations` (`org_id`,`brand_id`);
