CREATE TABLE `kb_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`conversation_id` text,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`quality_score` real NOT NULL,
	`entities` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_candidates_brand` ON `kb_candidates` (`org_id`,`brand_id`,`status`);--> statement-breakpoint
CREATE TABLE `kb_supersession_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`new_document_id` text,
	`conflicts_with_document_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conflicts_with_document_id`) REFERENCES `kb_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_supersession_proposals_brand` ON `kb_supersession_proposals` (`org_id`,`brand_id`,`status`);--> statement-breakpoint
CREATE TABLE `kb_golden_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`query` text NOT NULL,
	`expected_chunk_ids` text DEFAULT '[]' NOT NULL,
	`expected_answer` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source_query_log_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_query_log_id`) REFERENCES `kb_query_logs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_golden_queries_brand` ON `kb_golden_queries` (`org_id`,`brand_id`);
