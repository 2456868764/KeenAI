CREATE TABLE `workflow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_versions_workflow` ON `workflow_versions` (`workflow_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workflow_versions_workflow_version` ON `workflow_versions` (`workflow_id`,`version`);
