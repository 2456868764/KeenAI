import { z } from "zod";
import { brandPersonalitySchema } from "./personality.js";

export const createBrandSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(128),
  domain: z.string().max(255).optional(),
  locale: z.string().min(2).max(16).optional(),
  emailFrom: z.string().email().optional(),
  logoUrl: z.string().url().max(2048).optional(),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  domain: z.string().max(255).nullable().optional(),
  locale: z.string().min(2).max(16).optional(),
  emailFrom: z.string().email().nullable().optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  personality: brandPersonalitySchema.partial().optional(),
});
