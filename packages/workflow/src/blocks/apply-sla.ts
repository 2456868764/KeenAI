import { z } from "zod";

export const applySlaBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("apply_sla"),
  policyId: z.string().min(1).optional(),
});

export type ApplySlaBlock = z.infer<typeof applySlaBlockSchema>;

export type ApplySlaInput = {
  policyId?: string;
};

export type ApplySlaResult = {
  policyId?: string;
  breachCount: number;
  skipped?: string;
};
