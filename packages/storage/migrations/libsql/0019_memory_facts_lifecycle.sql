ALTER TABLE `memory_facts` ADD `last_access_at` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `access_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `eviction_score` real;
