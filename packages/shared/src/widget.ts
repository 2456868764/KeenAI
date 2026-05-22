import { z } from "zod";
import { messagePartSchema } from "./message-parts.js";

export const widgetUserSchema = z.object({
  id: z.string().min(1).max(128),
  userHash: z.string().regex(/^[a-f0-9]{64}$/i, "expected HMAC-SHA256 hex"),
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
});

export const widgetSessionSchema = z.object({
  orgSlug: z.string().min(1).max(64),
  brandSlug: z.string().min(1).max(64).default("default"),
  user: widgetUserSchema,
});

export const widgetCreateConversationSchema = z.object({
  subject: z.string().max(500).optional(),
  initialMessage: z
    .object({
      plainText: z.string().min(1).max(20_000),
    })
    .optional(),
});

export const widgetPostMessageSchema = z
  .object({
    plainText: z.string().max(20_000).optional(),
    attachmentIds: z.array(z.string().min(1)).max(5).optional(),
    parts: z.array(messagePartSchema).optional(),
  })
  .refine(
    (v) =>
      (typeof v.plainText === "string" && v.plainText.trim().length > 0) ||
      (v.attachmentIds !== undefined && v.attachmentIds.length > 0),
    { message: "plainText or attachmentIds required" },
  );

export type WidgetUser = z.infer<typeof widgetUserSchema>;
export type WidgetSessionInput = z.infer<typeof widgetSessionSchema>;
