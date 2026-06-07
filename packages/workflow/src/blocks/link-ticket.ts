import { z } from "zod";

export const TICKET_LINK_TYPES = ["tracks", "relates", "blocks"] as const;

export const linkTicketBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("link_ticket"),
  childTicketId: z.string().min(1),
  parentTicketId: z.string().min(1).optional(),
  linkType: z.enum(TICKET_LINK_TYPES).default("tracks"),
});

export type LinkTicketBlock = z.infer<typeof linkTicketBlockSchema>;
