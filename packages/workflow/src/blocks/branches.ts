import { z } from "zod";

export const branchConditionSchema = z.object({
  field: z.enum(["channelType", "priority", "conversationStatus"]),
  op: z.enum(["eq", "neq"]),
  value: z.string().min(1).max(64),
});

export type BranchCondition = z.infer<typeof branchConditionSchema>;

export const branchesBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("branches"),
  branches: z
    .array(
      z.object({
        label: z.string().max(128).optional(),
        condition: branchConditionSchema.optional(),
        nextId: z.string().nullable(),
      }),
    )
    .min(1)
    .max(16),
  elseNextId: z.string().nullable().optional(),
});

export type BranchesBlock = z.infer<typeof branchesBlockSchema>;

export type WorkflowFacts = {
  channelType?: string;
  priority?: string;
  conversationStatus?: string;
};

export function evaluateBranchCondition(
  condition: BranchCondition | undefined,
  facts: WorkflowFacts,
): boolean {
  if (!condition) return true;

  const actual =
    condition.field === "channelType"
      ? facts.channelType
      : condition.field === "priority"
        ? facts.priority
        : facts.conversationStatus;

  if (actual === undefined) return false;
  return condition.op === "eq" ? actual === condition.value : actual !== condition.value;
}

export function resolveBranchesNext(block: BranchesBlock, facts: WorkflowFacts): string | null {
  for (const branch of block.branches) {
    if (evaluateBranchCondition(branch.condition, facts)) {
      return branch.nextId;
    }
  }
  return block.elseNextId ?? null;
}
