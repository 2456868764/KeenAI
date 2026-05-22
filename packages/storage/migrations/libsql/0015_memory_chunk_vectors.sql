CREATE TABLE `memory_chunk_vectors` (
	`chunk_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`embedding_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `memory_chunks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mem_chunk_vec_org_brand` ON `memory_chunk_vectors` (`org_id`,`brand_id`);
