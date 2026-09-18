ALTER TABLE `channel_connections` ADD `transport` text DEFAULT 'webhook' NOT NULL;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_state` text DEFAULT 'stopped' NOT NULL;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_owner_id` text;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_lease_token` text;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_lease_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_heartbeat_at` integer;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_next_attempt_at` integer;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `runtime_cursor` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `reconnect_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_channel_connections_runtime_lease` ON `channel_connections` (`status`,`transport`,`runtime_next_attempt_at`,`runtime_lease_expires_at`);
