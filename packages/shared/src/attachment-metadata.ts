import { z } from "zod";

export const attachmentMetadataSchema = z.object({
  transcript: z.string().max(50_000).optional(),
  visionSummary: z.string().max(10_000).optional(),
  extractedText: z.string().max(200_000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  transcribedAt: z.string().datetime().optional(),
  visionSummarizedAt: z.string().datetime().optional(),
  extractedAt: z.string().datetime().optional(),
  source: z.enum(["upload", "email", "agent_tool", "im_download"]).optional(),
  platformRef: z.string().max(512).optional(),
});

export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
