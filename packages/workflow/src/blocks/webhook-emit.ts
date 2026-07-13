import { z } from "zod";

export const webhookEmitHeadersSchema = z
  .record(z.string().min(1).max(128), z.string().max(2048))
  .refine((headers) => Object.keys(headers).length <= 16, { message: "headers_too_many" });

export const webhookEmitBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("webhook_emit"),
  url: z.string().url(),
  eventName: z.string().min(1).max(128).optional(),
  payload: z.string().max(10_000).optional(),
  headers: webhookEmitHeadersSchema.optional(),
});

export type WebhookEmitBlock = z.infer<typeof webhookEmitBlockSchema>;

export type WebhookEmitInput = {
  blockId: string;
  url: string;
  eventName?: string;
  payload?: string;
  headers?: Record<string, string>;
};

export type WebhookEmitResult = {
  status: number;
  body: string;
  eventName: string;
};
