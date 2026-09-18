CREATE TABLE `conversation_auto_close_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`policy_source` text DEFAULT 'brand' NOT NULL,
	`dedupe_key` text NOT NULL,
	`due_at` integer NOT NULL,
	`basis_message_id` text,
	`basis_last_message_at` integer,
	`workflow_run_id` text,
	`workflow_block_id` text,
	`workflow_trigger` text,
	`agent_run_id` text,
	`resolution_type` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`completed_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_conversation_auto_close_jobs_dedupe` ON `conversation_auto_close_jobs` (`dedupe_key`);
--> statement-breakpoint
CREATE INDEX `idx_conversation_auto_close_jobs_due` ON `conversation_auto_close_jobs` (`status`,`due_at`);
--> statement-breakpoint
CREATE INDEX `idx_conversation_auto_close_jobs_conversation` ON `conversation_auto_close_jobs` (`conversation_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_conversation_auto_close_jobs_brand` ON `conversation_auto_close_jobs` (`brand_id`,`status`);
