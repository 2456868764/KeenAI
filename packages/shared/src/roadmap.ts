import { z } from "zod";

export const roadmapColumnSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
});

export const createRoadmapSchema = z.object({
  brandId: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(128),
  public: z.boolean().optional(),
  columns: z.array(roadmapColumnSchema).min(1).max(8).optional(),
});

export const createRoadmapItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  columnId: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  linkedPostId: z.string().min(1).optional(),
  eta: z.string().datetime().optional(),
});

export const updateRoadmapItemSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).nullable().optional(),
    columnId: z.string().min(1).max(64).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    linkedPostId: z.string().min(1).nullable().optional(),
    eta: z.string().datetime().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field required" });

export const listRoadmapsQuerySchema = z.object({
  brandId: z.string().min(1).optional(),
});
