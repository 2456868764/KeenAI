CREATE TABLE `agent_other_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`allow_handoff` integer DEFAULT true NOT NULL,
	`auto_close_resolved_enabled` integer DEFAULT true NOT NULL,
	`auto_close_resolved_delay_minutes` integer DEFAULT 7 NOT NULL,
	`abandoned_workflow_triggers` text DEFAULT '[]' NOT NULL,
	`abandoned_workflow_delay_minutes` integer DEFAULT 10 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_other_settings_brand` ON `agent_other_settings` (`brand_id`);
--> statement-breakpoint
CREATE INDEX `idx_agent_other_settings_org` ON `agent_other_settings` (`org_id`);
