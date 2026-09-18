CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`conversation_id` text,
	`workflow_run_id` text,
	`parent_run_id` text,
	`trigger` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`status` text DEFAULT 'created' NOT NULL,
	`phase` text DEFAULT 'plan' NOT NULL,
	`provider_id` text,
	`model_name` text,
	`prompt_version` text DEFAULT 'v1' NOT NULL,
	`max_iterations` integer DEFAULT 10 NOT NULL,
	`tool_budget` integer DEFAULT 8 NOT NULL,
	`token_budget` integer DEFAULT 6000 NOT NULL,
	`input_snapshot` text DEFAULT '{}' NOT NULL,
	`output_snapshot` text,
	`usage` text,
	`error_code` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_org_created` ON `agent_runs` (`org_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_conversation` ON `agent_runs` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_status` ON `agent_runs` (`org_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`phase` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_run_events_sequence` ON `agent_run_events` (`run_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `idx_agent_run_events_org_created` ON `agent_run_events` (`org_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`intent` text NOT NULL,
	`objective` text NOT NULL,
	`risk_level` text NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`allowed_tools` text DEFAULT '[]' NOT NULL,
	`required_evidence` text DEFAULT '[]' NOT NULL,
	`stop_conditions` text DEFAULT '[]' NOT NULL,
	`escalation_conditions` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_plans_run_version` ON `agent_plans` (`run_id`,`version`);
--> statement-breakpoint
CREATE TABLE `agent_context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`memory_scope` text NOT NULL,
	`intent` text NOT NULL,
	`weights` text NOT NULL,
	`sections` text DEFAULT '[]' NOT NULL,
	`context_hash` text NOT NULL,
	`context_preview` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_context_snapshots_run` ON `agent_context_snapshots` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_retrieval_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_version` text,
	`scope` text,
	`score` real,
	`reason` text,
	`content_hash` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`retrieved_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_retrieval_evidence_run` ON `agent_retrieval_evidence` (`run_id`,`retrieved_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_retrieval_evidence_source` ON `agent_retrieval_evidence` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE TABLE `agent_tool_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand_id` text,
	`source` text NOT NULL,
	`tool_pattern` text NOT NULL,
	`effect` text NOT NULL,
	`risk_level` text NOT NULL,
	`argument_constraints` text DEFAULT '{}' NOT NULL,
	`rule_version` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_tool_policy_rule` ON `agent_tool_policies` (`org_id`,`brand_id`,`source`,`tool_pattern`);
--> statement-breakpoint
CREATE INDEX `idx_agent_tool_policies_org_brand` ON `agent_tool_policies` (`org_id`,`brand_id`,`enabled`);
--> statement-breakpoint
CREATE TABLE `agent_policy_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`tool_call_id` text,
	`tool_name` text NOT NULL,
	`effect` text NOT NULL,
	`risk_level` text NOT NULL,
	`rule_id` text,
	`rule_version` integer,
	`reason` text NOT NULL,
	`input_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_policy_decisions_run` ON `agent_policy_decisions` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_source` text NOT NULL,
	`risk_level` text NOT NULL,
	`status` text NOT NULL,
	`arguments` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error_code` text,
	`idempotency_key` text NOT NULL,
	`policy_decision_id` text,
	`trace_id` text,
	`span_id` text,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_tool_calls_run` ON `agent_tool_calls` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_tool_calls_idempotency` ON `agent_tool_calls` (`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `agent_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`reason` text,
	`expires_at` integer,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_approvals_pending` ON `agent_approvals` (`org_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_approvals_run` ON `agent_approvals` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_escalations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text,
	`reason_code` text NOT NULL,
	`severity` text NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`failed_step` text,
	`attempted_actions` text DEFAULT '[]' NOT NULL,
	`recommended_next_action` text,
	`assigned_team_id` text,
	`assignee_id` text,
	`sla_deadline` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`acknowledged_at` integer,
	`resolved_at` integer,
	`resume_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_escalations_open` ON `agent_escalations` (`org_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_escalations_run` ON `agent_escalations` (`run_id`);
--> statement-breakpoint
CREATE TABLE `agent_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`org_id` text NOT NULL,
	`plan_complete` integer NOT NULL,
	`action_verified` integer NOT NULL,
	`evidence_coverage` real NOT NULL,
	`score` real NOT NULL,
	`outcome` text NOT NULL,
	`issues` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_evaluations_run` ON `agent_evaluations` (`run_id`,`created_at`);
