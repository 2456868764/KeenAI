ALTER TABLE `channel_message_links` ADD `provider_action` text;
--> statement-breakpoint
ALTER TABLE `channel_message_links` ADD `provider_resource_type` text DEFAULT 'message' NOT NULL;
--> statement-breakpoint
ALTER TABLE `channel_message_links` ADD `action_index` integer DEFAULT 0 NOT NULL;
