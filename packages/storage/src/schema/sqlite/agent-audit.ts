import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const AGENT_RUN_STATUSES = [
  "created",
  "planning",
  "retrieving",
  "awaiting_approval",
  "acting",
  "observing",
  "completed",
  "escalated",
  "failed",
] as const;
export const AGENT_RUN_PHASES = ["plan", "retrieve", "act", "observe", "escalate"] as const;
export const AGENT_RISK_LEVELS = ["r0", "r1", "r2", "r3", "r4"] as const;
export const AGENT_POLICY_EFFECTS = ["allow", "require_approval", "deny"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunPhase = (typeof AGENT_RUN_PHASES)[number];
export type AgentRiskLevel = (typeof AGENT_RISK_LEVELS)[number];
export type AgentPolicyEffect = (typeof AGENT_POLICY_EFFECTS)[number];

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    conversationId: text("conversation_id"),
    workflowRunId: text("workflow_run_id"),
    parentRunId: text("parent_run_id"),
    trigger: text("trigger").notNull(),
    actorType: text("actor_type").notNull().default("system"),
    actorId: text("actor_id"),
    status: text("status").$type<AgentRunStatus>().notNull().default("created"),
    phase: text("phase").$type<AgentRunPhase>().notNull().default("plan"),
    providerId: text("provider_id"),
    modelName: text("model_name"),
    promptVersion: text("prompt_version").notNull().default("v1"),
    maxIterations: integer("max_iterations").notNull().default(10),
    toolBudget: integer("tool_budget").notNull().default(8),
    tokenBudget: integer("token_budget").notNull().default(6000),
    inputSnapshot: text("input_snapshot", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outputSnapshot: text("output_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
    usage: text("usage", { mode: "json" }).$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    retentionUntil: integer("retention_until", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrgCreated: index("idx_agent_runs_org_created").on(t.orgId, t.createdAt),
    idxConversation: index("idx_agent_runs_conversation").on(t.conversationId, t.createdAt),
    idxStatus: index("idx_agent_runs_status").on(t.orgId, t.status, t.createdAt),
  }),
);

export const agentRunEvents = sqliteTable(
  "agent_run_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    sequence: integer("sequence").notNull(),
    phase: text("phase").$type<AgentRunPhase>().notNull(),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull().default("system"),
    actorId: text("actor_id"),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    uqRunSequence: uniqueIndex("uq_agent_run_events_sequence").on(t.runId, t.sequence),
    idxOrgCreated: index("idx_agent_run_events_org_created").on(t.orgId, t.createdAt),
  }),
);

export const agentPlans = sqliteTable(
  "agent_plans",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    version: integer("version").notNull().default(1),
    intent: text("intent").notNull(),
    objective: text("objective").notNull(),
    riskLevel: text("risk_level").$type<AgentRiskLevel>().notNull(),
    steps: text("steps", { mode: "json" }).$type<string[]>().notNull().default([]),
    allowedTools: text("allowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    requiredEvidence: text("required_evidence", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    stopConditions: text("stop_conditions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    escalationConditions: text("escalation_conditions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    uqRunVersion: uniqueIndex("uq_agent_plans_run_version").on(t.runId, t.version),
  }),
);

export const agentContextSnapshots = sqliteTable(
  "agent_context_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    memoryScope: text("memory_scope").notNull(),
    intent: text("intent").notNull(),
    weights: text("weights", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    sections: text("sections", { mode: "json" })
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    contextHash: text("context_hash").notNull(),
    contextPreview: text("context_preview"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ idxRun: index("idx_agent_context_snapshots_run").on(t.runId, t.createdAt) }),
);

export const agentRetrievalEvidence = sqliteTable(
  "agent_retrieval_evidence",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersion: text("source_version"),
    scope: text("scope"),
    score: real("score"),
    reason: text("reason"),
    contentHash: text("content_hash").notNull(),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxRun: index("idx_agent_retrieval_evidence_run").on(t.runId, t.retrievedAt),
    idxSource: index("idx_agent_retrieval_evidence_source").on(t.sourceType, t.sourceId),
  }),
);

export const agentToolPolicies = sqliteTable(
  "agent_tool_policies",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    source: text("source").notNull(),
    toolPattern: text("tool_pattern").notNull(),
    effect: text("effect").$type<AgentPolicyEffect>().notNull(),
    riskLevel: text("risk_level").$type<AgentRiskLevel>().notNull(),
    argumentConstraints: text("argument_constraints", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    actorRoles: text("actor_roles", { mode: "json" }).$type<string[]>().notNull().default([]),
    channels: text("channels", { mode: "json" }).$type<string[]>().notNull().default([]),
    resourcePatterns: text("resource_patterns", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    ruleVersion: integer("rule_version").notNull().default(1),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqToolRule: uniqueIndex("uq_agent_tool_policy_rule").on(
      t.orgId,
      t.brandId,
      t.source,
      t.toolPattern,
    ),
    idxOrgBrand: index("idx_agent_tool_policies_org_brand").on(t.orgId, t.brandId, t.enabled),
  }),
);

export const agentPolicyDecisions = sqliteTable(
  "agent_policy_decisions",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    toolCallId: text("tool_call_id"),
    toolName: text("tool_name").notNull(),
    effect: text("effect").$type<AgentPolicyEffect>().notNull(),
    riskLevel: text("risk_level").$type<AgentRiskLevel>().notNull(),
    ruleId: text("rule_id"),
    ruleVersion: integer("rule_version"),
    reason: text("reason").notNull(),
    inputHash: text("input_hash").notNull(),
    executionMode: text("execution_mode").notNull().default("governed"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ idxRun: index("idx_agent_policy_decisions_run").on(t.runId, t.createdAt) }),
);

export const agentToolCalls = sqliteTable(
  "agent_tool_calls",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    toolName: text("tool_name").notNull(),
    toolSource: text("tool_source").notNull(),
    riskLevel: text("risk_level").$type<AgentRiskLevel>().notNull(),
    status: text("status").notNull(),
    arguments: text("arguments", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    result: text("result", { mode: "json" }).$type<unknown>(),
    errorCode: text("error_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    idempotent: integer("idempotent", { mode: "boolean" }).notNull().default(false),
    policyDecisionId: text("policy_decision_id"),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxRun: index("idx_agent_tool_calls_run").on(t.runId, t.createdAt),
    uqIdempotency: uniqueIndex("uq_agent_tool_calls_idempotency").on(t.idempotencyKey),
  }),
);

export const agentApprovals = sqliteTable(
  "agent_approvals",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull().default("pending"),
    riskLevel: text("risk_level").$type<AgentRiskLevel>().notNull().default("r2"),
    argumentsPreview: text("arguments_preview", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    approvalCount: integer("approval_count").notNull().default(0),
    requestedBy: text("requested_by"),
    decidedBy: text("decided_by"),
    reason: text("reason"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxPending: index("idx_agent_approvals_pending").on(t.orgId, t.status, t.createdAt),
    idxRun: index("idx_agent_approvals_run").on(t.runId, t.createdAt),
  }),
);

export const agentApprovalDecisions = sqliteTable(
  "agent_approval_decisions",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    approvalId: text("approval_id")
      .notNull()
      .references(() => agentApprovals.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    decidedBy: text("decided_by").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    uqApprover: uniqueIndex("uq_agent_approval_decision_approver").on(t.approvalId, t.decidedBy),
    idxApproval: index("idx_agent_approval_decisions_approval").on(t.approvalId, t.createdAt),
  }),
);

export const agentEscalations = sqliteTable(
  "agent_escalations",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: text("conversation_id"),
    reasonCode: text("reason_code").notNull(),
    severity: text("severity").notNull(),
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    failedStep: text("failed_step"),
    attemptedActions: text("attempted_actions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    recommendedNextAction: text("recommended_next_action"),
    assignedTeamId: text("assigned_team_id"),
    assigneeId: text("assignee_id"),
    slaDeadline: integer("sla_deadline", { mode: "timestamp_ms" }),
    status: text("status").notNull().default("open"),
    acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resumeToken: text("resume_token").notNull().$defaultFn(newUlid),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOpen: index("idx_agent_escalations_open").on(t.orgId, t.status, t.createdAt),
    idxRun: index("idx_agent_escalations_run").on(t.runId),
  }),
);

export const agentEvaluations = sqliteTable(
  "agent_evaluations",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    planComplete: integer("plan_complete", { mode: "boolean" }).notNull(),
    actionVerified: integer("action_verified", { mode: "boolean" }).notNull(),
    evidenceCoverage: real("evidence_coverage").notNull(),
    citationCoverage: real("citation_coverage").notNull().default(0),
    toolSuccessRate: real("tool_success_rate").notNull().default(1),
    score: real("score").notNull(),
    outcome: text("outcome").notNull(),
    issues: text("issues", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ idxRun: index("idx_agent_evaluations_run").on(t.runId, t.createdAt) }),
);

export const agentEvaluationFeedback = sqliteTable(
  "agent_evaluation_feedback",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    evaluatorId: text("evaluator_id").notNull(),
    verdict: text("verdict").notNull(),
    csatScore: integer("csat_score"),
    correctedResponse: text("corrected_response"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ idxRun: index("idx_agent_evaluation_feedback_run").on(t.runId, t.createdAt) }),
);

export const agentEvalCases = sqliteTable(
  "agent_eval_cases",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    name: text("name").notNull(),
    instruction: text("instruction").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    requiredEvidence: text("required_evidence", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrgBrand: index("idx_agent_eval_cases_org_brand").on(t.orgId, t.brandId, t.enabled),
  }),
);

export type AgentRunRow = typeof agentRuns.$inferSelect;
export type AgentRunEventRow = typeof agentRunEvents.$inferSelect;
export type AgentPlanRow = typeof agentPlans.$inferSelect;
export type AgentContextSnapshotRow = typeof agentContextSnapshots.$inferSelect;
export type AgentRetrievalEvidenceRow = typeof agentRetrievalEvidence.$inferSelect;
export type AgentToolPolicyRow = typeof agentToolPolicies.$inferSelect;
export type AgentPolicyDecisionRow = typeof agentPolicyDecisions.$inferSelect;
export type AgentToolCallRow = typeof agentToolCalls.$inferSelect;
export type AgentApprovalRow = typeof agentApprovals.$inferSelect;
export type AgentApprovalDecisionRow = typeof agentApprovalDecisions.$inferSelect;
export type AgentEscalationRow = typeof agentEscalations.$inferSelect;
export type AgentEvaluationRow = typeof agentEvaluations.$inferSelect;
export type AgentEvaluationFeedbackRow = typeof agentEvaluationFeedback.$inferSelect;
export type AgentEvalCaseRow = typeof agentEvalCases.$inferSelect;
