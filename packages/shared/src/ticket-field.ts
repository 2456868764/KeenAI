import { z } from "zod";

/** P2-04: Zod-typed Field DSL for ticket custom fields. */
export const ticketFieldTypeSchema = z.enum(["text", "number", "boolean", "select", "date"]);
export type TicketFieldType = z.infer<typeof ticketFieldTypeSchema>;

export const ticketFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(128),
  type: ticketFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string().min(1)).max(32).optional(),
});

export type TicketField = z.infer<typeof ticketFieldSchema>;
export const ticketFieldListSchema = z.array(ticketFieldSchema).max(32);

export function parseTicketFields(raw: unknown): TicketField[] {
  const parsed = ticketFieldListSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function validateTicketCustomFields(
  fields: TicketField[],
  values: Record<string, unknown>,
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.key];
    const missing = value === undefined || value === null || value === "";

    if (field.required && missing) {
      errors[field.key] = "required";
      continue;
    }
    if (missing) continue;

    switch (field.type) {
      case "text":
        if (typeof value !== "string") errors[field.key] = "invalid_text";
        break;
      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) errors[field.key] = "invalid_number";
        break;
      case "boolean":
        if (typeof value !== "boolean") errors[field.key] = "invalid_boolean";
        break;
      case "select":
        if (typeof value !== "string" || !(field.options ?? []).includes(value)) {
          errors[field.key] = "invalid_select";
        }
        break;
      case "date":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          errors[field.key] = "invalid_date";
        }
        break;
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}
