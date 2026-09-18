import type { DraftToolRuntime } from "@keenai/llm";
import { describe, expect, it } from "vitest";
import { evaluateAgentRun } from "../src/evaluation.js";
import { buildStructuredAgentPlan } from "../src/plan.js";
import { evaluateAgentToolPolicy, isAgentToolExposed } from "../src/policy.js";

const mcpTool: DraftToolRuntime = {
  name: "crm.delete_customer",
  description: "Delete a customer",
  parametersSchema: { type: "object" },
  audit: { source: "mcp", riskLevel: "r3", idempotent: false },
  execute: async () => ({ ok: true }),
};

describe("auditable agent planning and policy", () => {
  it("does not expose MCP tools without an explicit allowlist rule", () => {
    expect(isAgentToolExposed(mcpTool, [])).toBe(false);
    expect(
      isAgentToolExposed(mcpTool, [
        {
          id: "rule-1",
          source: "mcp",
          toolPattern: "crm.*",
          effect: "require_approval",
          riskLevel: "r3",
          ruleVersion: 1,
        },
      ]),
    ).toBe(true);
  });

  it("enforces explicit argument constraints before execution", () => {
    const decision = evaluateAgentToolPolicy({
      tool: mcpTool,
      args: { amount: 500 },
      rules: [
        {
          id: "rule-2",
          source: "mcp",
          toolPattern: "crm.*",
          effect: "allow",
          riskLevel: "r2",
          ruleVersion: 3,
          argumentConstraints: { maxNumeric: { amount: 100 } },
        },
      ],
    });
    expect(decision.effect).toBe("deny");
    expect(decision.reason).toBe("argument_constraints_failed");
  });

  it("supports workflow-level pre-authorized and read-only modes", () => {
    const preAuthorized = evaluateAgentToolPolicy({
      tool: mcpTool,
      args: { customerId: "customer-1" },
      rules: [],
      executionMode: "pre_authorized",
    });
    expect(preAuthorized.effect).toBe("allow");
    expect(preAuthorized.reason).toBe("workflow_pre_authorized");

    const readOnlyDenied = evaluateAgentToolPolicy({
      tool: mcpTool,
      args: { customerId: "customer-1" },
      rules: [],
      executionMode: "read_only",
    });
    expect(readOnlyDenied.effect).toBe("deny");
    expect(readOnlyDenied.reason).toBe("workflow_read_only_mode");

    const readTool: DraftToolRuntime = {
      ...mcpTool,
      name: "crm.get_customer",
      description: "Get a customer",
      audit: { source: "mcp", riskLevel: "r0", idempotent: true },
    };
    expect(
      evaluateAgentToolPolicy({
        tool: readTool,
        args: { customerId: "customer-1" },
        rules: [],
        executionMode: "read_only",
      }).effect,
    ).toBe("allow");

    expect(
      evaluateAgentToolPolicy({
        tool: mcpTool,
        args: { customerId: "customer-1" },
        executionMode: "read_only",
        rules: [
          {
            id: "unsafe-read-only-override",
            source: "mcp",
            toolPattern: "crm.*",
            effect: "allow",
            riskLevel: "r0",
            ruleVersion: 1,
          },
        ],
      }).effect,
    ).toBe("deny");
  });

  it("matches policy context and preserves multi-approval thresholds", () => {
    const decision = evaluateAgentToolPolicy({
      tool: mcpTool,
      args: { customerId: "customer-1" },
      context: { actorRole: "workflow", channel: "email", resource: "crm:prod" },
      rules: [
        {
          id: "context-rule",
          source: "mcp",
          toolPattern: "crm.*",
          effect: "require_approval",
          riskLevel: "r3",
          ruleVersion: 2,
          actorRoles: ["workflow"],
          channels: ["email"],
          resourcePatterns: ["crm:*"],
          requiredApprovals: 2,
        },
      ],
    });
    expect(decision.effect).toBe("require_approval");
    expect(decision.ruleId).toBe("context-rule");
    expect(decision.requiredApprovals).toBe(2);
  });

  it("persists a business plan shape and evaluates evidence and action outcomes", () => {
    const plan = buildStructuredAgentPlan({
      intent: "troubleshooting",
      instruction: "Fix the failed export",
      tools: [mcpTool],
    });
    expect(plan.riskLevel).toBe("r3");
    expect(plan.allowedTools).toEqual([mcpTool.name]);
    expect(plan.steps.some((step) => step.includes("policy gate"))).toBe(true);

    const evaluation = evaluateAgentRun({
      replyText: "The issue is resolved.",
      evidenceCount: 3,
      requiredEvidenceCount: 3,
      toolCalls: [{ status: "succeeded" }],
      resolution: { type: "assumed", confidence: 0.8, evidence: "verified result" },
      hadError: false,
    });
    expect(evaluation.outcome).toBe("pass");
    expect(evaluation.actionVerified).toBe(true);
    expect(evaluation.evidenceCoverage).toBe(1);
  });
});
