import { z } from "zod";

export const listPortalTicketsSchema = z.object({
  customerId: z.string().email().optional(),
});

export const portalMagicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const portalMagicLinkVerifySchema = z.object({
  token: z.string().min(10),
});
