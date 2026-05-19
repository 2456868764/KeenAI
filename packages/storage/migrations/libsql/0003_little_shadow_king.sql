CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`org_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`payload` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notif_account_read` ON `notifications` (`account_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `idx_notif_org` ON `notifications` (`org_id`,`created_at`);