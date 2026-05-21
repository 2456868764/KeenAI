CREATE TABLE `copilot_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`action` text NOT NULL,
	`draft_length` integer,
	`provider_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_copilot_events_conv` ON `copilot_events` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_copilot_events_org` ON `copilot_events` (`org_id`,`created_at`);