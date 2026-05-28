CREATE TABLE `custom_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`name` text NOT NULL,
	`description` text,
	`when_to_use` text,
	`parameters_schema` text DEFAULT '{"type":"object","properties":{}}' NOT NULL,
	`endpoint` text NOT NULL,
	`method` text DEFAULT 'POST' NOT NULL,
	`headers` text DEFAULT '{}' NOT NULL,
	`auth_type` text DEFAULT 'none' NOT NULL,
	`auth_secret_ref` text,
	`data_access` text DEFAULT '{}' NOT NULL,
	`sandbox` text DEFAULT 'http_direct' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_custom_actions_brand` ON `custom_actions` (`org_id`,`brand_id`,`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_custom_actions_brand_name` ON `custom_actions` (`org_id`,`brand_id`,`name`);
