import { z } from "zod";

export const KEENI_SKILL_STATUSES = ["active", "draft", "retired"] as const;
export type KeeniSkillStatus = (typeof KEENI_SKILL_STATUSES)[number];

export const KEENI_SKILL_SOURCES = ["manual", "auto_discovered", "imported"] as const;
export type KeeniSkillSource = (typeof KEENI_SKILL_SOURCES)[number];

export const keenSkillTriggerSchema = z.object({
  intent: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type KeeniSkillToolStep = {
  kind: "tool";
  tool: string;
  inputs: Record<string, unknown>;
};

export type KeeniSkillEscalateStep = {
  kind: "escalate";
  reason: string;
};

export type KeeniSkillBranchStep = {
  kind: "branch";
  if: string;
  then: KeeniSkillStep[];
  else: KeeniSkillStep[];
};

export type KeeniSkillStep = KeeniSkillToolStep | KeeniSkillBranchStep | KeeniSkillEscalateStep;

export const keenSkillToolStepSchema = z.object({
  kind: z.literal("tool"),
  tool: z.string().min(1),
  inputs: z.record(z.unknown()).default({}),
});

export const keenSkillEscalateStepSchema = z.object({
  kind: z.literal("escalate"),
  reason: z.string().min(1),
});

export const keenSkillStepSchema: z.ZodType<KeeniSkillStep> = z.lazy(() =>
  z.union([
    keenSkillToolStepSchema,
    keenSkillEscalateStepSchema,
    z.object({
      kind: z.literal("branch"),
      if: z.string().min(1),
      // biome-ignore lint/suspicious/noThenProperty: branch step DSL uses then/else
      then: z.array(keenSkillStepSchema),
      else: z.array(keenSkillStepSchema),
    }),
  ]),
) as z.ZodType<KeeniSkillStep>;

export const keenSkillBranchStepSchema = z.custom<KeeniSkillBranchStep>(
  (value) => keenSkillStepSchema.safeParse(value).success,
);

export const keenSkillMetricsSchema = z
  .object({
    successRate: z.number().min(0).max(1),
    avgResolutionTimeMs: z.number().nonnegative(),
    customerSatisfaction: z.number().min(0).max(5),
  })
  .partial();

export const keenSkillSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  brandId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: keenSkillTriggerSchema,
  steps: z.array(keenSkillStepSchema).min(1),
  metrics: keenSkillMetricsSchema.optional(),
  status: z.enum(KEENI_SKILL_STATUSES).default("draft"),
  source: z.enum(KEENI_SKILL_SOURCES).default("manual"),
  version: z.number().int().min(1).default(1),
  lastImproved: z.string().datetime().optional(),
});

export type KeeniSkill = z.infer<typeof keenSkillSchema>;

export const keenSkillMatchSchema = z.object({
  skill: keenSkillSchema,
  score: z.number().min(0).max(1),
  matchedIntent: z.string(),
});

export type KeeniSkillMatch = z.infer<typeof keenSkillMatchSchema>;

export const keenSkillRunResultSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  stepsExecuted: z.number().int().nonnegative(),
  status: z.enum(["completed", "escalated", "failed"]),
  output: z.unknown().optional(),
  escalatedReason: z.string().optional(),
});

export type KeeniSkillRunResult = z.infer<typeof keenSkillRunResultSchema>;

export const DEFAULT_REFUND_SKILL: KeeniSkill = keenSkillSchema.parse({
  id: "skill-refund-handler",
  orgId: "org-demo",
  brandId: "brand-demo",
  name: "refund-handler",
  description: "Standard refund request flow",
  trigger: { intent: "refund_request", confidence: 0.7 },
  status: "active",
  source: "manual",
  version: 1,
  steps: [
    { kind: "tool", tool: "verify_user_identity", inputs: {} },
    { kind: "tool", tool: "check_eligibility", inputs: {} },
    {
      kind: "branch",
      if: "eligibility.ok",
      // biome-ignore lint/suspicious/noThenProperty: branch step DSL uses then/else
      then: [{ kind: "tool", tool: "execute_refund", inputs: {} }],
      else: [{ kind: "escalate", reason: "not_eligible" }],
    },
  ],
  metrics: { successRate: 0.85 },
});
