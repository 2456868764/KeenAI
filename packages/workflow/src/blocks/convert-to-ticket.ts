import { z } from "zod";

export const convertToTicketBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("convert_to_ticket"),
  title: z.string().max(500).optional(),
});

export type ConvertToTicketBlock = z.infer<typeof convertToTicketBlockSchema>;
