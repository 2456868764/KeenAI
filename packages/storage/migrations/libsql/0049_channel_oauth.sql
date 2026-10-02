ALTER TABLE `channel_connections` ADD `credential_refresh_lease_token` text;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `credential_refresh_lease_expires_at` integer;
--> statement-breakpoint
CREATE TABLE `channel_oauth_states` (
  `state_hash` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `org_id` text NOT NULL,
  `brand_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_channel_oauth_states_expires` ON `channel_oauth_states` (`expires_at`);
