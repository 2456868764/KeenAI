CREATE TABLE `memory_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`body_md` text NOT NULL,
	`lifecycle` text DEFAULT 'pending_extraction' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mem_chunk_org_brand` ON `memory_chunks` (`org_id`,`brand_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_chunk_source_ref` ON `memory_chunks` (`org_id`,`brand_id`,`source_ref`);