import { z } from "zod";

export const outboundDirectivesSchema = z.object({
  asVoice: z.boolean().optional(),
  asDocument: z.boolean().optional(),
});

export type OutboundDirectives = z.infer<typeof outboundDirectivesSchema>;

export const outboundPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
    format: z.enum(["plain", "tiptap", "html"]).optional(),
  }),
  z.object({
    type: z.literal("attachment"),
    attachmentId: z.string().min(1),
  }),
  z.object({
    type: z.literal("generated"),
    toolRunId: z.string().min(1),
    kind: z.enum(["image", "audio", "video", "file"]),
  }),
]);

export type OutboundPart = z.infer<typeof outboundPartSchema>;

export const agentResponseParseResultSchema = z.object({
  plainText: z.string(),
  attachmentIds: z.array(z.string().min(1)),
  storageKeys: z.array(z.string().min(1)),
  parts: z.array(outboundPartSchema),
  directives: outboundDirectivesSchema,
});

export type AgentResponseParseResult = z.infer<typeof agentResponseParseResultSchema>;
