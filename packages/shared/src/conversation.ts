import { z } from "zod";
import { messagePartSchema } from "./message-parts.js";

export const CONVERSATION_STATUSES = ["open", "snoozed", "pending", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const CHANNEL_TYPES = ["messenger", "email", "api", "slack", "telegram"] as const;
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

export const createMessageSchema = z
  .object({
    plainText: z.string().max(50_000).optional(),
    /** Agent/Keeni markdown response — parsed via parseAgentResponse (MEDIA: · ![img](attachment:id)) */
    agentOutboundText: z.string().max(50_000).optional(),
    attachmentIds: z.array(z.string().min(1)).max(10).optional(),
    parts: z.array(messagePartSchema).optional(),
    content: messageContentSchema.optional(),
    isInternal: z.boolean().default(false),
    senderType: senderTypeSchema.optional(),
    inReplyTo: z.string().optional(),
  })
  .refine(
    (v) =>
      (typeof v.plainText === "string" && v.plainText.trim().length > 0) ||
      (typeof v.agentOutboundText === "string" && v.agentOutboundText.trim().length > 0) ||
      (v.attachmentIds !== undefined && v.attachmentIds.length > 0),
    { message: "plainText, agentOutboundText, or attachmentIds required" },
  );

export const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),
});

export const conversationRatingSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  ratingComment: z.string().max(2000).optional(),
});

export type ConversationRating = z.infer<typeof conversationRatingSchema>;

export const updateConversationSchema = z
  .object({
    status: conversationStatusSchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    subject: z.string().max(500).optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    priority: conversationPrioritySchema.optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    ratingComment: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.assigneeId !== undefined ||
      v.subject !== undefined ||
      v.tags !== undefined ||
      v.snoozedUntil !== undefined ||
      v.priority !== undefined ||
      v.rating !== undefined ||
      v.ratingComment !== undefined,
    { message: "at least one field required" },
  );
