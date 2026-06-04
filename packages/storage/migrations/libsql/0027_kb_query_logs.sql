CREATE TABLE `kb_query_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`query_text` text NOT NULL,
	`retrieved_chunk_ids` text DEFAULT '[]' NOT NULL,
	`scores` text DEFAULT '[]' NOT NULL,
	`latency_ms` integer,
	`user_feedback` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_query_logs_brand` ON `kb_query_logs` (`org_id`,`brand_id`,`created_at`);
