import type { DraftToolRuntime } from "@keenai/llm";
import type { AgentRiskLevel } from "@keenai/storage/schema";
import type { QueryIntent } from "./context/assembler.js";
import { classifyToolRisk, maxRiskLevel } from "./policy.js";

export type StructuredAgentPlan = {
  intent: QueryIntent;
  objective: string;
  riskLevel: AgentRiskLevel;
  steps: string[];
  allowedTools: string[];
  requiredEvidence: string[];
  stopConditions: string[];
  escalationConditions: string[];
};

export type BuildStructuredAgentPlanInput = {
  intent: QueryIntent;
  instruction?: string;
  subject?: string;
  tools?: DraftToolRuntime[];
};

function objectiveFromInput(input: BuildStructuredAgentPlanInput): string {
  const value =
    input.instruction?.trim() || input.subject?.trim() || "Resolve the customer request";
  return value.slice(0, 500);
}

function requiredEvidenceForIntent(intent: QueryIntent): string[] {
  if (intent === "personal") return ["customer_memory", "conversation_history"];
  if (intent === "troubleshooting") return ["knowledge_base", "current_state", "tool_result"];
  if (intent === "procedural") return ["knowledge_base", "applicable_policy"];
  return ["knowledge_base"];
}

/** A persisted business plan, not model chain-of-thought. */
export function buildStructuredAgentPlan(
  input: BuildStructuredAgentPlanInput,
): StructuredAgentPlan {
  const tools = input.tools ?? [];
  const toolRisk = tools.reduce<AgentRiskLevel>(
    (risk, tool) => maxRiskLevel(risk, classifyToolRisk(tool)),
    "r0",
  );
  const sensitiveRisk: AgentRiskLevel = /refund|credit|payment|delete|权限|退款|赔偿|删除/i.test(
    `${input.subject ?? ""} ${input.instruction ?? ""}`,
  )
    ? "r3"
    : "r0";
  const riskLevel = maxRiskLevel(toolRisk, sensitiveRisk);

  return {
    intent: input.intent,
    objective: objectiveFromInput(input),
    riskLevel,
    steps: [
      "Retrieve scoped customer and product evidence",
      "Check evidence freshness, permissions, and conflicts",
      ...(tools.length > 0 ? ["Select an allowed tool and pass the policy gate"] : []),
      "Produce a supported response or action",
      "Verify the result and escalate when a stop condition is met",
    ],
    allowedTools: tools.map((tool) => tool.name),
    requiredEvidence: requiredEvidenceForIntent(input.intent),
    stopConditions: [
      "objective_satisfied",
      "tool_budget_exhausted",
      "iteration_budget_exhausted",
      "approval_required",
      "policy_denied",
    ],
    escalationConditions: [
      "customer_requests_human",
      "insufficient_or_conflicting_evidence",
      "sensitive_or_high_risk_action",
      "tool_failure",
      "low_confidence_resolution",
    ],
  };
}
