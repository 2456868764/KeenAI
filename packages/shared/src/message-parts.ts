import { z } from "zod";
import { attachmentMetadataSchema } from "./attachment-metadata.js";

export const MESSAGE_KINDS = [
  "text",
  "photo",
  "voice",
  "video",
  "document",
  "mixed",
  "sticker",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const messageKindSchema = z.enum(MESSAGE_KINDS);

export const messagePartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
    format: z.enum(["plain", "tiptap", "html"]).optional(),
  }),
  z.object({
    type: z.literal("image"),
    attachmentId: z.string().min(1),
    alt: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("audio"),
    attachmentId: z.string().min(1),
    durationMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("video"),
    attachmentId: z.string().min(1),
    posterAttachmentId: z.string().min(1).optional(),
    durationMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("file"),
    attachmentId: z.string().min(1),
    fileName: z.string().min(1),
  }),
]);

export type MessagePart = z.infer<typeof messagePartSchema>;

export const serializedAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  url: z.string().optional(),
  metadata: attachmentMetadataSchema.optional(),
});

export type SerializedAttachment = z.infer<typeof serializedAttachmentSchema>;

export function inferMessageKind(parts: MessagePart[]): MessageKind {
  if (parts.length === 0) return "text";
  const media = parts.filter((p) => p.type !== "text");
  const text = parts.filter((p) => p.type === "text");
  if (media.length === 0) return "text";
  if (media.length > 1 || (media.length === 1 && text.length > 0)) return "mixed";
  const only = media[0];
  if (!only) return "text";
  switch (only.type) {
    case "image":
      return "photo";
    case "audio":
      return "voice";
    case "video":
      return "video";
    case "file":
      return "document";
    default:
      return "text";
  }
}

export function attachmentPlaceholder(fileName: string, contentType?: string | null): string {
  const mime = contentType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return `[Image: ${fileName}]`;
  if (mime.startsWith("audio/")) return "[Voice message]";
  if (mime.startsWith("video/")) return `[Video: ${fileName}]`;
  return `[File: ${fileName}]`;
}

export function buildPlainTextFromParts(
  parts: MessagePart[],
  attachments: Map<
    string,
    {
      fileName: string | null;
      contentType: string | null;
      transcript?: string;
    }
  >,
): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      if (part.text.trim()) chunks.push(part.text.trim());
      continue;
    }
    const att = attachments.get(part.attachmentId);
    if (part.type === "audio") {
      const transcript = att?.transcript?.trim();
      if (transcript) {
        chunks.push(transcript);
        continue;
      }
    }
    const fileName = part.type === "file" ? part.fileName : (att?.fileName ?? "attachment");
    chunks.push(attachmentPlaceholder(fileName, att?.contentType));
  }
  return chunks.join("\n").trim() || "(empty)";
}
