CREATE TABLE `memory_hotness` (
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`score` real NOT NULL,
	`signals` text DEFAULT '{"messageCount7d":0,"openTicketCount":0,"negativeCsatWeight":0,"agentPinBoost":0}' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `brand_id`, `entity_type`, `entity_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mem_hotness_org_brand` ON `memory_hotness` (`org_id`,`brand_id`,`score`);