import { z } from "zod";

export const listNotificationsSchema = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const presignUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(52_428_800),
});

export const searchConversationsSchema = z.object({
  q: z.string().min(1).max(200),
  brandId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
