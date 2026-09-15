import type { WorkflowBlock } from "../../lib/api";

type BranchesBlock = Extract<WorkflowBlock, { type: "branches" }>;
type ApplyRulesBlock = Extract<WorkflowBlock, { type: "apply_rules" }>;

export function createDefaultBranch(index: number): BranchesBlock["branches"][number] {
  return {
    label: `Branch ${index}`,
    condition: { field: "channelType", op: "eq", value: "messenger" },
    nextId: null,
  };
}

export function createDefaultRule(index: number, nextId: string): ApplyRulesBlock["rules"][number] {
  return {
    label: `Rule ${index}`,
    condition: { field: "channelType", op: "eq", value: "messenger" },
    nextId,
  };
}
