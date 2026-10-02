CREATE TABLE `channel_provider_app_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`app_id` text NOT NULL,
	`state_type` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_provider_app_states` ON `channel_provider_app_states` (`provider`,`app_id`,`state_type`);
--> statement-breakpoint
CREATE INDEX `idx_channel_provider_app_states_expiry` ON `channel_provider_app_states` (`provider`,`expires_at`);
