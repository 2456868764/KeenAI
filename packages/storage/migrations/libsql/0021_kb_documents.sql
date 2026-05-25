CREATE TABLE `kb_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`type` text NOT NULL,
	`name` text,
	`config` text DEFAULT '{}' NOT NULL,
	`secrets_ref` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sync_strategy` text DEFAULT 'manual',
	`sync_schedule` text,
	`last_synced_at` integer,
	`next_sync_at` integer,
	`error` text,
	`document_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_sources_brand` ON `kb_sources` (`org_id`,`brand_id`,`status`);--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`source_id` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`url` text,
	`content_hash` text,
	`raw_content` text,
	`content_type` text,
	`canonical_locale` text,
	`translations` text DEFAULT '{}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_updated_at` integer,
	`indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `kb_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_docs_brand` ON `kb_documents` (`org_id`,`brand_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_kb_docs_hash` ON `kb_documents` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_kb_docs_source_external` ON `kb_documents` (`source_id`,`external_id`);
