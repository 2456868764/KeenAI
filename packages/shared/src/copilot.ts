import { z } from "zod";

export const copilotDraftBodySchema = z.object({
  conversationId: z.string().min(1),
  instruction: z.string().max(2_000).optional(),
});

export const copilotEventBodySchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(["accept", "edit", "discard"]),
  draftLength: z.number().int().min(0).optional(),
  providerId: z.string().max(64).optional(),
});

export const COPILOT_EVENT_ACTIONS = ["accept", "edit", "discard"] as const;
export type CopilotEventAction = (typeof COPILOT_EVENT_ACTIONS)[number];
