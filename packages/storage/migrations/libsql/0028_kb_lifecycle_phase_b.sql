ALTER TABLE `kb_chunks` ADD `provenance` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `kb_chunks` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `kb_documents` ADD `supersedes_document_id` text REFERENCES `kb_documents`(`id`);--> statement-breakpoint
CREATE INDEX `idx_kb_docs_supersedes` ON `kb_documents` (`supersedes_document_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_status` ON `kb_chunks` (`org_id`,`brand_id`,`status`);
