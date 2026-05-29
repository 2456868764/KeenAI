CREATE TABLE `custom_action_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`action_id` text NOT NULL,
	`action_name` text NOT NULL,
	`source` text NOT NULL,
	`triggered_by` text,
	`conversation_id` text,
	`parameters` text DEFAULT '{}' NOT NULL,
	`request_url` text NOT NULL,
	`request_method` text NOT NULL,
	`response_status` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT false NOT NULL,
	`result_data` text,
	`filtered` integer DEFAULT false NOT NULL,
	`error_code` text,
	`duration_ms` integer NOT NULL,
	`trace_id` text,
	`span_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`) REFERENCES `custom_actions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_custom_action_logs_action` ON `custom_action_logs` (`action_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_custom_action_logs_org` ON `custom_action_logs` (`org_id`,`created_at`);
