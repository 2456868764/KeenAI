CREATE TABLE `widget_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`primary_color` text DEFAULT '#7c5cff' NOT NULL,
	`launcher_icon_url` text,
	`agent_name` text DEFAULT 'Keeni AI Agent' NOT NULL,
	`agent_subtitle` text DEFAULT 'The team can also help' NOT NULL,
	`agent_avatar_url` text,
	`greeting_title` text DEFAULT 'Hey! How can we help?' NOT NULL,
	`greeting_body` text DEFAULT 'Ask a question, submit a ticket, or browse help articles.' NOT NULL,
	`home_enabled` integer DEFAULT 1 NOT NULL,
	`messages_enabled` integer DEFAULT 1 NOT NULL,
	`help_enabled` integer DEFAULT 1 NOT NULL,
	`changelog_enabled` integer DEFAULT 1 NOT NULL,
	`tickets_enabled` integer DEFAULT 1 NOT NULL,
	`powered_by_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_widget_settings_brand` ON `widget_settings` (`brand_id`);--> statement-breakpoint
CREATE INDEX `idx_widget_settings_org` ON `widget_settings` (`org_id`);--> statement-breakpoint
CREATE TABLE `widget_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`settings_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`icon` text,
	`item_type` text NOT NULL,
	`module_key` text,
	`href` text,
	`location` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settings_id`) REFERENCES `widget_settings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_menu_items_brand_location` ON `widget_menu_items` (`brand_id`,`location`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_widget_menu_items_settings` ON `widget_menu_items` (`settings_id`);--> statement-breakpoint
CREATE TABLE `widget_quick_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`settings_id` text NOT NULL,
	`label` text NOT NULL,
	`action_type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settings_id`) REFERENCES `widget_settings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_quick_actions_brand` ON `widget_quick_actions` (`brand_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_widget_quick_actions_settings` ON `widget_quick_actions` (`settings_id`);--> statement-breakpoint
CREATE TABLE `widget_featured_content` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`settings_id` text NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text,
	`title_override` text,
	`image_url` text,
	`href` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settings_id`) REFERENCES `widget_settings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_featured_content_brand` ON `widget_featured_content` (`brand_id`,`content_type`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_widget_featured_content_settings` ON `widget_featured_content` (`settings_id`);
