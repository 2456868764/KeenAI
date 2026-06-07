import { z } from "zod";
import { type WorkflowFacts, branchConditionSchema, evaluateBranchCondition } from "./branches.js";

export const applyRulesBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("apply_rules"),
  rules: z
    .array(
      z.object({
        label: z.string().max(128).optional(),
        condition: branchConditionSchema,
        nextId: z.string().min(1),
      }),
    )
    .min(1)
    .max(16),
});

export type ApplyRulesBlock = z.infer<typeof applyRulesBlockSchema>;

export function resolveApplyRulesMatches(
  block: ApplyRulesBlock,
  facts: WorkflowFacts,
  blockIds: Set<string>,
): string[] {
  const matched: string[] = [];
  for (const rule of block.rules) {
    if (!evaluateBranchCondition(rule.condition, facts)) continue;
    if (!blockIds.has(rule.nextId)) continue;
    if (!matched.includes(rule.nextId)) matched.push(rule.nextId);
  }
  return matched;
}
