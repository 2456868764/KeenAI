import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export const changelogAudienceSegmentSchema = z.object({
  name: z.string().min(1).max(128),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
  countries: z.array(z.string().length(2)).max(50).optional(),
});

export const changelogAudienceFilterSchema = z.object({
  segments: z.array(changelogAudienceSegmentSchema).max(20),
});

export const createChangelogEntrySchema = z.object({
  brandId: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1).max(256),
  summary: z.string().max(500).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  plainText: z.string().max(100_000).optional(),
  categoryTags: z
    .array(z.enum(["new", "improved", "fixed"]))
    .max(3)
    .optional(),
  audienceFilter: changelogAudienceFilterSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const updateChangelogEntrySchema = z
  .object({
    slug: slugSchema.optional(),
    title: z.string().min(1).max(256).optional(),
    summary: z.string().max(500).nullable().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    plainText: z.string().max(100_000).optional(),
    categoryTags: z
      .array(z.enum(["new", "improved", "fixed"]))
      .max(3)
      .optional(),
    audienceFilter: changelogAudienceFilterSchema.optional(),
    status: z.enum(["draft", "scheduled", "published"]).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field required" });

export const listChangelogEntriesSchema = z.object({
  brandId: z.string().min(1),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
