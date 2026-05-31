import { z } from "zod";

export const KEENI_AGENT_TRIGGERS = ["user_msg", "scheduled", "workflow_step"] as const;
export type KeeniAgentTrigger = (typeof KEENI_AGENT_TRIGGERS)[number];

export const keenAgentParamsSchema = z.object({
  orgId: z.string().min(1),
  brandId: z.string().min(1),
  conversationId: z.string().min(1),
  userId: z.string().nullable().optional(),
});

export type KeeniAgentParams = z.infer<typeof keenAgentParamsSchema>;

export const keenAgentRunRequestSchema = z.object({
  trigger: z.enum(KEENI_AGENT_TRIGGERS).default("user_msg"),
  stream: z.boolean().default(true),
  maxIterations: z.number().int().min(1).max(20).default(10),
  toolBudget: z.number().int().min(0).max(20).default(8),
  tokenBudget: z.number().int().min(512).max(32_000).default(6000),
  resourceId: z.string().min(1),
  threadId: z.string().min(1),
});

export type KeeniAgentRunRequest = z.infer<typeof keenAgentRunRequestSchema>;

export const keenAgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thinking"), content: z.string() }),
  z.object({
    type: z.literal("tool_call_start"),
    tool: z.string(),
    params: z.record(z.unknown()),
  }),
  z.object({ type: z.literal("tool_call_result"), tool: z.string(), result: z.unknown() }),
  z.object({ type: z.literal("message_delta"), delta: z.string() }),
  z.object({ type: z.literal("message_complete"), text: z.string() }),
  z.object({
    type: z.literal("error"),
    error: z.object({ name: z.string(), message: z.string() }),
  }),
  z.object({ type: z.literal("done") }),
]);

export type KeeniAgentStreamEvent = z.infer<typeof keenAgentStreamEventSchema>;
