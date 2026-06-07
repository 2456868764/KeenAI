import { z } from "zod";

export const sendTicketUpdateBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("send_ticket_update"),
  ticketId: z.string().min(1).optional(),
});

export type SendTicketUpdateBlock = z.infer<typeof sendTicketUpdateBlockSchema>;
