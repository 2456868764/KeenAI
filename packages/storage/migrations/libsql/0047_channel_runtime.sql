CREATE TABLE `channel_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`name` text NOT NULL,
	`external_account_id` text DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`credentials` text DEFAULT '{}' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`last_error` text,
	`last_connected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_connections_external_account` ON `channel_connections` (`org_id`,`brand_id`,`channel_type`,`external_account_id`);
--> statement-breakpoint
CREATE INDEX `idx_channel_connections_brand_type` ON `channel_connections` (`brand_id`,`channel_type`,`status`);
--> statement-breakpoint
CREATE TABLE `channel_ingress_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`raw_payload` text NOT NULL,
	`request_headers` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`claimed_at` integer,
	`claim_token` text,
	`lease_expires_at` integer,
	`processed_at` integer,
	`last_error_code` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_ingress_provider_event` ON `channel_ingress_events` (`connection_id`,`provider_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_channel_ingress_dispatch` ON `channel_ingress_events` (`status`,`available_at`,`lease_expires_at`);
--> statement-breakpoint
CREATE TABLE `channel_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`external_user_id` text NOT NULL,
	`contact_id` text,
	`display_name` text,
	`profile` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_identities_external_user` ON `channel_identities` (`connection_id`,`external_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_channel_identities_contact` ON `channel_identities` (`org_id`,`contact_id`);
--> statement-breakpoint
CREATE TABLE `channel_conversation_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`external_thread_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_conversation_external_thread` ON `channel_conversation_links` (`connection_id`,`external_thread_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_conversation_connection` ON `channel_conversation_links` (`connection_id`,`conversation_id`);
--> statement-breakpoint
CREATE TABLE `channel_message_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_message_provider_message` ON `channel_message_links` (`connection_id`,`provider_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_channel_message_link_message` ON `channel_message_links` (`message_id`);
--> statement-breakpoint
CREATE TABLE `channel_session_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`ingress_event_id` text,
	`command_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`claimed_at` integer,
	`claim_token` text,
	`lease_expires_at` integer,
	`completed_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingress_event_id`) REFERENCES `channel_ingress_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_session_command_idempotency` ON `channel_session_commands` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_session_command_sequence` ON `channel_session_commands` (`conversation_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `idx_channel_session_command_dispatch` ON `channel_session_commands` (`conversation_id`,`status`,`priority`,`sequence`);
--> statement-breakpoint
CREATE TABLE `channel_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`external_thread_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 8 NOT NULL,
	`available_at` integer NOT NULL,
	`claimed_at` integer,
	`claim_token` text,
	`lease_expires_at` integer,
	`accepted_at` integer,
	`completed_at` integer,
	`last_error_code` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_outbox_idempotency` ON `channel_outbox` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_channel_outbox_dispatch` ON `channel_outbox` (`status`,`available_at`,`lease_expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_channel_outbox_conversation` ON `channel_outbox` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `channel_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`disposition` text,
	`provider_status` integer,
	`provider_response` text,
	`error_code` text,
	`error_message` text,
	`next_attempt_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `channel_outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_delivery_attempt` ON `channel_delivery_attempts` (`outbox_id`,`attempt`);
--> statement-breakpoint
CREATE INDEX `idx_channel_delivery_attempt_outbox` ON `channel_delivery_attempts` (`outbox_id`);
--> statement-breakpoint
CREATE TABLE `channel_delivery_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`outbox_id` text,
	`provider_message_id` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`payload` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outbox_id`) REFERENCES `channel_outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_delivery_receipt` ON `channel_delivery_receipts` (`connection_id`,`provider_message_id`,`status`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_channel_delivery_receipt_outbox` ON `channel_delivery_receipts` (`outbox_id`);
--> statement-breakpoint
CREATE TABLE `channel_dead_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason` text NOT NULL,
	`payload` text,
	`replay_count` integer DEFAULT 0 NOT NULL,
	`last_replayed_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_channel_dead_letter_source` ON `channel_dead_letters` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_channel_dead_letter_unresolved` ON `channel_dead_letters` (`org_id`,`resolved_at`);
