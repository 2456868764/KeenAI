import type { DraftToolRuntime } from "@keenai/llm";
import type { AgentPolicyEffect, AgentRiskLevel } from "@keenai/storage/schema";

const RISK_ORDER: AgentRiskLevel[] = ["r0", "r1", "r2", "r3", "r4"];

export const AGENT_TOOL_EXECUTION_MODES = ["governed", "pre_authorized", "read_only"] as const;
export type AgentToolExecutionMode = (typeof AGENT_TOOL_EXECUTION_MODES)[number];

export type AgentToolPolicyRule = {
  id: string;
  source: string;
  toolPattern: string;
  effect: AgentPolicyEffect;
  riskLevel: AgentRiskLevel;
  ruleVersion: number;
  argumentConstraints?: Record<string, unknown>;
  actorRoles?: string[];
  channels?: string[];
  resourcePatterns?: string[];
  requiredApprovals?: number;
};

export type AgentToolPolicyContext = {
  actorRole?: string | null;
  channel?: string | null;
  resource?: string | null;
};

export type AgentToolPolicyDecision = {
  effect: AgentPolicyEffect;
  riskLevel: AgentRiskLevel;
  ruleId: string | null;
  ruleVersion: number | null;
  reason: string;
  requiredApprovals: number;
};

export function maxRiskLevel(a: AgentRiskLevel, b: AgentRiskLevel): AgentRiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

export function classifyToolRisk(tool: DraftToolRuntime): AgentRiskLevel {
  if (tool.audit?.riskLevel) return tool.audit.riskLevel;
  const value = `${tool.name} ${tool.description}`;
  if (
    /delete|destroy|payment|refund|payout|permission|credential|删除|退款|支付|权限/i.test(value)
  ) {
    return "r3";
  }
  if (
    /send|publish|update|create|execute|assign|close|write|发送|发布|更新|创建|执行/i.test(value)
  ) {
    return "r2";
  }
  if (/tag|note|comment|标签|备注/i.test(value)) return "r1";
  if (/search|get|list|read|query|lookup|搜索|查询|读取/i.test(value)) return "r0";
  return tool.audit?.source === "mcp" ? "r2" : "r1";
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function toolPatternMatches(pattern: string, toolName: string): boolean {
  const source = `^${escapeRegex(pattern).replaceAll("*", ".*")}$`;
  return new RegExp(source, "i").test(toolName);
}

function constraintsPass(
  constraints: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
): boolean {
  if (!constraints) return true;
  const blockedFields = Array.isArray(constraints.blockedFields)
    ? constraints.blockedFields.filter((item): item is string => typeof item === "string")
    : [];
  if (blockedFields.some((field) => field in args)) return false;

  const maxNumeric = constraints.maxNumeric as Record<string, unknown> | undefined;
  if (maxNumeric && typeof maxNumeric === "object") {
    for (const [field, max] of Object.entries(maxNumeric)) {
      if (typeof max === "number" && typeof args[field] === "number" && args[field] > max) {
        return false;
      }
    }
  }
  return true;
}

function contextMatches(rule: AgentToolPolicyRule, context?: AgentToolPolicyContext): boolean {
  if (rule.actorRoles?.length && !rule.actorRoles.includes(context?.actorRole ?? "")) return false;
  if (rule.channels?.length && !rule.channels.includes(context?.channel ?? "")) return false;
  if (
    rule.resourcePatterns?.length &&
    !rule.resourcePatterns.some((pattern) => toolPatternMatches(pattern, context?.resource ?? ""))
  ) {
    return false;
  }
  return true;
}

export function evaluateAgentToolPolicy(input: {
  tool: DraftToolRuntime;
  args: Record<string, unknown>;
  rules: AgentToolPolicyRule[];
  executionMode?: AgentToolExecutionMode;
  context?: AgentToolPolicyContext;
}): AgentToolPolicyDecision {
  const executionMode = input.executionMode ?? "governed";
  const source = input.tool.audit?.source ?? "builtin";
  const classifiedRisk = classifyToolRisk(input.tool);
  if (executionMode === "read_only" && classifiedRisk !== "r0") {
    return {
      effect: "deny",
      riskLevel: classifiedRisk,
      ruleId: null,
      ruleVersion: null,
      reason: "workflow_read_only_mode",
      requiredApprovals: 0,
    };
  }
  const explicit = input.rules.find(
    (rule) =>
      (rule.source === source || rule.source === "*") &&
      toolPatternMatches(rule.toolPattern, input.tool.name) &&
      contextMatches(rule, input.context),
  );

  if (explicit) {
    if (!constraintsPass(explicit.argumentConstraints, input.args)) {
      return {
        effect: "deny",
        riskLevel: explicit.riskLevel,
        ruleId: explicit.id,
        ruleVersion: explicit.ruleVersion,
        reason: "argument_constraints_failed",
        requiredApprovals: explicit.requiredApprovals ?? 1,
      };
    }
    const effect =
      executionMode === "pre_authorized" && explicit.effect === "require_approval"
        ? "allow"
        : explicit.effect;
    return {
      effect,
      riskLevel: explicit.riskLevel,
      ruleId: explicit.id,
      ruleVersion: explicit.ruleVersion,
      reason:
        effect !== explicit.effect
          ? "workflow_pre_authorized_by_explicit_policy"
          : "explicit_tool_policy",
      requiredApprovals: explicit.requiredApprovals ?? 1,
    };
  }

  const riskLevel = classifiedRisk;
  if (executionMode === "read_only") {
    return {
      effect: "allow",
      riskLevel,
      ruleId: null,
      ruleVersion: null,
      reason: "workflow_read_only_fast_path",
      requiredApprovals: 0,
    };
  }
  if (riskLevel === "r4") {
    return {
      effect: "deny",
      riskLevel,
      ruleId: null,
      ruleVersion: null,
      reason: "default_r4_deny",
      requiredApprovals: 0,
    };
  }
  if (riskLevel === "r3" || source === "mcp") {
    if (executionMode === "pre_authorized") {
      return {
        effect: "allow",
        riskLevel,
        ruleId: null,
        ruleVersion: null,
        reason: "workflow_pre_authorized",
        requiredApprovals: 0,
      };
    }
    return {
      effect: "require_approval",
      riskLevel,
      ruleId: null,
      ruleVersion: null,
      reason: source === "mcp" ? "default_mcp_approval" : "default_high_risk_approval",
      requiredApprovals: 1,
    };
  }
  return {
    effect: "allow",
    riskLevel,
    ruleId: null,
    ruleVersion: null,
    reason: "default_low_risk_allow",
    requiredApprovals: 0,
  };
}

/** MCP tools require an explicit allow/approval rule before they are exposed to the model. */
export function isAgentToolExposed(tool: DraftToolRuntime, rules: AgentToolPolicyRule[]): boolean {
  if (tool.audit?.source !== "mcp") return true;
  return rules.some(
    (rule) =>
      (rule.source === "mcp" || rule.source === "*") &&
      rule.effect !== "deny" &&
      toolPatternMatches(rule.toolPattern, tool.name),
  );
}
