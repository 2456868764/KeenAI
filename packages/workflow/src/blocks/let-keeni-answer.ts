import type { KeeniResolution, KeeniResolutionType } from "@keenai/agent/resolution";
import { z } from "zod";

export const letKeeniAnswerOutcomeRoutingSchema = z.object({
  resolvedNext: z.string().nullable(),
  unresolvedNext: z.string().nullable(),
  escalatedNext: z.string().nullable(),
});

export type LetKeeniAnswerOutcomeRouting = z.infer<typeof letKeeniAnswerOutcomeRoutingSchema>;

export const letKeeniAnswerBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("let_keeni_answer"),
  instructions: z.string().max(2_000).optional(),
  maxSteps: z.number().int().min(1).max(20).default(8),
  toolFilter: z.array(z.string().min(1)).optional(),
  outcomeRouting: letKeeniAnswerOutcomeRoutingSchema.optional(),
});

export type LetKeeniAnswerBlock = z.infer<typeof letKeeniAnswerBlockSchema>;

export type LetKeeniAnswerInput = {
  block: LetKeeniAnswerBlock;
  context: {
    orgId: string;
    brandId: string;
    conversationId: string;
    targetCustomerId?: string | null;
    subject?: string;
    isShadowRun?: boolean;
  };
};

export type LetKeeniAnswerResult = {
  replyText: string;
  resolution: KeeniResolution;
  nextBlockId: string | null;
};

export function resolveLetKeeniAnswerNext(
  resolutionType: KeeniResolutionType,
  routing?: LetKeeniAnswerOutcomeRouting,
): string | null {
  if (!routing) return null;
  if (resolutionType === "confirmed" || resolutionType === "assumed") {
    return routing.resolvedNext;
  }
  if (resolutionType === "escalated") {
    return routing.escalatedNext;
  }
  return routing.unresolvedNext;
}
