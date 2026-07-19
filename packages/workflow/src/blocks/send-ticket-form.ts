import { z } from "zod";

const SEND_TICKET_FORM_AUTO_CLOSE_MINUTES = [1, 3, 5, 7, 10, 15, 30, 60] as const;

export const ticketFormFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(128),
  type: z.enum(["text", "number", "boolean", "select", "date"]).default("text"),
  required: z.boolean().default(true),
  options: z.array(z.string().min(1).max(128)).max(32).optional(),
});

export const sendTicketFormBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("send_ticket_form"),
  prompt: z.string().min(1).max(2000),
  title: z.string().min(1).max(200).optional(),
  ticketId: z.string().min(1).max(64).optional(),
  fields: z.array(ticketFormFieldSchema).min(1).max(16),
  autoCloseMinutes: z
    .number()
    .int()
    .refine((v) => (SEND_TICKET_FORM_AUTO_CLOSE_MINUTES as readonly number[]).includes(v), {
      message: "invalid_auto_close_minutes",
    })
    .optional(),
});

export type SendTicketFormBlock = z.infer<typeof sendTicketFormBlockSchema>;
export type TicketFormField = z.infer<typeof ticketFormFieldSchema>;

export type SendTicketFormInput = {
  blockId: string;
  prompt: string;
  title?: string;
  ticketId?: string;
  fields: TicketFormField[];
  workflowRunId?: string;
  autoCloseMinutes?: number;
};

export type SendTicketFormResult = {
  ticketId: string;
};

export type SendTicketFormSubmission = {
  ticketId?: string;
  values: Record<string, unknown>;
};
