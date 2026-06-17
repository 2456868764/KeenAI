import { z } from "zod";

export const memoryEntityTypeSchema = z.enum(["person", "org", "product", "topic", "feature"]);

export const memoryRelationTypeSchema = z.enum([
  "works_at",
  "role",
  "concerns",
  "owns",
  "mentioned_with",
  "requested",
  "questioned",
]);

export const extractedKgEntitySchema = z.object({
  type: memoryEntityTypeSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).default({}),
});

export const extractedKgRelationSchema = z.object({
  fromName: z.string().min(1),
  fromType: memoryEntityTypeSchema.optional(),
  relationType: memoryRelationTypeSchema,
  toName: z.string().min(1),
  toType: memoryEntityTypeSchema.optional(),
  confidence: z.number().min(0).max(1),
});

export const extractedKgSchema = z.object({
  entities: z.array(extractedKgEntitySchema).max(24).default([]),
  relations: z.array(extractedKgRelationSchema).max(32).default([]),
});

export type ExtractedKgPayload = z.infer<typeof extractedKgSchema>;
