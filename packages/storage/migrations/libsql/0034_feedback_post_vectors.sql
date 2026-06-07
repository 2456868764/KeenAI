CREATE TABLE `feedback_post_vectors` (
	`post_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`board_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`embedding_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `feedback_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `feedback_boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_post_vec_board` ON `feedback_post_vectors` (`org_id`,`board_id`);
