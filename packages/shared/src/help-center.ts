import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export const createHelpCollectionSchema = z.object({
  brandId: z.string().min(1),
  slug: slugSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  icon: z.string().max(64).optional(),
  public: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateHelpCollectionSchema = createHelpCollectionSchema
  .omit({ brandId: true, slug: true })
  .partial();

export const createHelpArticleSchema = z.object({
  brandId: z.string().min(1),
  collectionId: z.string().min(1).optional().nullable(),
  slug: slugSchema,
  title: z.string().min(1).max(256),
  content: z.record(z.string(), z.unknown()).optional(),
  plainText: z.string().max(100_000).optional(),
  excerpt: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  seoTitle: z.string().max(128).optional(),
  seoDescription: z.string().max(320).optional(),
});

export const updateHelpArticleSchema = z.object({
  collectionId: z.string().min(1).optional().nullable(),
  slug: slugSchema.optional(),
  title: z.string().min(1).max(256).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  plainText: z.string().max(100_000).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  seoTitle: z.string().max(128).optional().nullable(),
  seoDescription: z.string().max(320).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const listHelpArticlesSchema = z.object({
  brandId: z.string().min(1),
  collectionId: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
