import { z } from "zod";

export const CUSTOM_ACTION_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const CUSTOM_ACTION_AUTH_TYPES = ["none", "bearer", "hmac", "basic"] as const;
export const CUSTOM_ACTION_SANDBOXES = ["http_direct", "workers", "isolated_vm"] as const;

export type CustomActionHttpMethod = (typeof CUSTOM_ACTION_HTTP_METHODS)[number];
export type CustomActionAuthType = (typeof CUSTOM_ACTION_AUTH_TYPES)[number];
export type CustomActionSandbox = (typeof CUSTOM_ACTION_SANDBOXES)[number];

const customActionNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "name must be snake_case starting with a letter");

export const customActionBodySchema = z.object({
  brandId: z.string().min(1),
  name: customActionNameSchema,
  description: z.string().max(2000).optional(),
  whenToUse: z.string().max(2000).optional(),
  parametersSchema: z.record(z.unknown()).default({ type: "object", properties: {} }),
  endpoint: z.string().url().max(2048),
  method: z.enum(CUSTOM_ACTION_HTTP_METHODS).default("POST"),
  headers: z.record(z.string()).default({}),
  authType: z.enum(CUSTOM_ACTION_AUTH_TYPES).default("none"),
  authSecretRef: z.string().max(256).optional(),
  dataAccess: z.record(z.unknown()).default({}),
  sandbox: z.enum(CUSTOM_ACTION_SANDBOXES).default("http_direct"),
  enabled: z.boolean().default(true),
});

export const updateCustomActionBodySchema = customActionBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field required" });

export const listCustomActionsQuerySchema = z.object({
  brandId: z.string().min(1).optional(),
  enabled: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type CustomActionBody = z.infer<typeof customActionBodySchema>;
export type UpdateCustomActionBody = z.infer<typeof updateCustomActionBodySchema>;
export type ListCustomActionsQuery = z.infer<typeof listCustomActionsQuerySchema>;

export const executeCustomActionBodySchema = z.object({
  parameters: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

export type ExecuteCustomActionBody = z.infer<typeof executeCustomActionBodySchema>;
