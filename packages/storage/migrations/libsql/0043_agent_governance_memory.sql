ALTER TABLE `agent_runs` ADD `retention_until` integer;
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `definition_snapshot` text;
--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD `previous_hash` text;
--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD `event_hash` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_tool_policies` ADD `actor_roles` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_tool_policies` ADD `channels` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_tool_policies` ADD `resource_patterns` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_tool_policies` ADD `required_approvals` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_policy_decisions` ADD `execution_mode` text DEFAULT 'governed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_tool_calls` ADD `idempotent` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_approvals` ADD `risk_level` text DEFAULT 'r2' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_approvals` ADD `arguments_preview` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_approvals` ADD `required_approvals` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_approvals` ADD `approval_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `agent_approval_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`approval_id` text NOT NULL,
	`org_id` text NOT NULL,
	`decided_by` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`approval_id`) REFERENCES `agent_approvals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_approval_decision_approver` ON `agent_approval_decisions` (`approval_id`,`decided_by`);
--> statement-breakpoint
CREATE INDEX `idx_agent_approval_decisions_approval` ON `agent_approval_decisions` (`approval_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `category` text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `source_version` text;
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `content_hash` text;
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `memory_facts` ADD `conflict_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `memory_fact_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`fact_id` text,
	`org_id` text NOT NULL,
	`brand_id` text,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`confidence` real NOT NULL,
	`importance` real NOT NULL,
	`source` text NOT NULL,
	`source_version` text,
	`content_hash` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`valid_from` integer NOT NULL,
	`expires_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`fact_id`) REFERENCES `memory_facts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_memory_fact_versions_fact` ON `memory_fact_versions` (`fact_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_memory_fact_versions_scope` ON `memory_fact_versions` (`org_id`,`scope`,`scope_id`,`predicate`);
--> statement-breakpoint
ALTER TABLE `agent_evaluations` ADD `citation_coverage` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_evaluations` ADD `tool_success_rate` real DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE `agent_evaluation_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`verdict` text NOT NULL,
	`csat_score` integer,
	`corrected_response` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_evaluation_feedback_run` ON `agent_evaluation_feedback` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_eval_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`name` text NOT NULL,
	`instruction` text NOT NULL,
	`expected_outcome` text NOT NULL,
	`required_evidence` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_eval_cases_org_brand` ON `agent_eval_cases` (`org_id`,`brand_id`,`enabled`);
