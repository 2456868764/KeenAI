CREATE TABLE `feedback_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`public` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_feedback_boards_org_slug` ON `feedback_boards` (`org_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_feedback_boards_org` ON `feedback_boards` (`org_id`);--> statement-breakpoint
CREATE TABLE `feedback_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`public` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `feedback_boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_statuses_board` ON `feedback_statuses` (`board_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `feedback_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`plain_text` text NOT NULL,
	`author_id` text,
	`author_member_id` text,
	`status_id` text,
	`upvote_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `feedback_boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`status_id`) REFERENCES `feedback_statuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_posts_board` ON `feedback_posts` (`board_id`,`upvote_count`);--> statement-breakpoint
CREATE TABLE `feedback_votes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `feedback_posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feedback_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text,
	`author_member_id` text,
	`plain_text` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `feedback_posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_comments_post` ON `feedback_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sla_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`first_response_sec` integer,
	`resolution_sec` integer,
	`operational_hours_only` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sla_policies_org` ON `sla_policies` (`org_id`);--> statement-breakpoint
CREATE TABLE `office_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`schedule` text DEFAULT '{}' NOT NULL,
	`holidays` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_office_hours_org` ON `office_hours` (`org_id`);--> statement-breakpoint
CREATE TABLE `sla_breach_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`policy_id` text,
	`metric` text NOT NULL,
	`threshold_pct` integer NOT NULL,
	`due_at` integer NOT NULL,
	`breached_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `sla_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sla_breach_conv` ON `sla_breach_events` (`conversation_id`,`metric`);
