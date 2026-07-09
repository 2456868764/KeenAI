CREATE TABLE `feedback_subscriptions` (
	`post_id` text NOT NULL,
	`subscriber_type` text NOT NULL,
	`subscriber_id` text NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `subscriber_type`, `subscriber_id`),
	FOREIGN KEY (`post_id`) REFERENCES `feedback_posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_subscriptions_post` ON `feedback_subscriptions` (`post_id`);
