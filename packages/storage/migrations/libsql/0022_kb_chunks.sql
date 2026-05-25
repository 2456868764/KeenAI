CREATE TABLE `kb_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`document_id` text NOT NULL,
	`parent_chunk_id` text,
	`section_id` text,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`context_prefix` text,
	`content_size` integer,
	`locale` text,
	`permissions` text DEFAULT '{}' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `kb_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_brand` ON `kb_chunks` (`org_id`,`brand_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_doc` ON `kb_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_locale` ON `kb_chunks` (`brand_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_kb_chunks_doc_index` ON `kb_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `kb_chunk_vectors` (
	`chunk_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`embedding_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `kb_chunks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_chunk_vec_org_brand` ON `kb_chunk_vectors` (`org_id`,`brand_id`);
