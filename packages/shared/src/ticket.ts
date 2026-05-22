import { z } from "zod";

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

export const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.record(z.unknown()).optional(),
  typeId: z.string().min(1).optional(),
  statusId: z.string().min(1).optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  conversationId: z.string().min(1).optional(),
});

export const updateTicketSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.record(z.unknown()).nullable().optional(),
    statusId: z.string().min(1).nullable().optional(),
    priority: ticketPrioritySchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.statusId !== undefined ||
      v.priority !== undefined ||
      v.assigneeId !== undefined,
    { message: "at least one field required" },
  );

export const listTicketsSchema = z.object({
  statusId: z.string().optional(),
  assigneeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const createTicketFromConversationSchema = z.object({
  title: z.string().min(1).max(500).optional(),
});

export const createTicketFromConversationBodySchema = createTicketFromConversationSchema.extend({
  conversationId: z.string().min(1),
});
