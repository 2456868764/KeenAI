CREATE TABLE `ticket_conversations` (
	`ticket_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`relationship` text DEFAULT 'primary' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`ticket_id`, `conversation_id`),
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_id` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_events_ticket` ON `ticket_events` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ticket_links` (
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`link_type` text NOT NULL,
	PRIMARY KEY(`parent_id`, `child_id`, `link_type`),
	FOREIGN KEY (`parent_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ticket_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text,
	`is_default` integer DEFAULT false,
	`ticket_type_ids` text DEFAULT '[]',
	`sort_order` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_statuses_org` ON `ticket_statuses` (`org_id`);--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text,
	`fields` text DEFAULT '[]',
	`status_ids` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_types_org` ON `ticket_types` (`org_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status_id` text,
	`priority` text DEFAULT 'normal',
	`assignee_id` text,
	`team_id` text,
	`reporter_id` text,
	`customer_id` text,
	`custom_fields` text DEFAULT '{}',
	`due_date` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`status_id`) REFERENCES `ticket_statuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_org_status` ON `tickets` (`org_id`,`status_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_assignee` ON `tickets` (`assignee_id`);