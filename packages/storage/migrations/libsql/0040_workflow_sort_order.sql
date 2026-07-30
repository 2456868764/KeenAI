ALTER TABLE `workflows` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_workflows_org_trigger_sort` ON `workflows` (`org_id`,`trigger`,`status`,`sort_order`);
