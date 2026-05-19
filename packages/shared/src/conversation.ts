import { z } from "zod";

export const CONVERSATION_STATUSES = ["open", "snoozed", "pending", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const CHANNEL_TYPES = ["messenger", "email", "api", "slack"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const SENDER_TYPES = ["user", "agent", "ai", "bot", "system"] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export const conversationPrioritySchema = z.enum(CONVERSATION_PRIORITIES);
export const channelTypeSchema = z.enum(CHANNEL_TYPES);
export const senderTypeSchema = z.enum(SENDER_TYPES);

export const messageContentSchema = z.object({
  type: z.enum(["text", "tiptap"]).default("text"),
  text: z.string().optional(),
  doc: z.record(z.unknown()).optional(),
});

export const createConversationSchema = z.object({
  brandId: z.string().min(1),
  channelType: channelTypeSchema.default("messenger"),
  channelId: z.string().min(1).default("default"),
  subject: z.string().max(500).optional(),
  userId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  initialMessage: z
    .object({
      plainText: z.string().min(1).max(50_000),
      content: messageContentSchema.optional(),
      isInternal: z.boolean().optional(),
    })
    .optional(),
});

export const listConversationsSchema = z.object({
  status: conversationStatusSchema.optional(),
  brandId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const createMessageSchema = z.object({
  plainText: z.string().min(1).max(50_000),
  content: messageContentSchema.optional(),
  isInternal: z.boolean().default(false),
  senderType: senderTypeSchema.optional(),
  inReplyTo: z.string().optional(),
});

export const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),
});

export const updateConversationSchema = z
  .object({
    status: conversationStatusSchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    subject: z.string().max(500).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    priority: conversationPrioritySchema.optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.assigneeId !== undefined ||
      v.subject !== undefined ||
      v.tags !== undefined ||
      v.snoozedUntil !== undefined ||
      v.priority !== undefined,
    { message: "at least one field required" },
  );
