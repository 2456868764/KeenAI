import { z } from "zod";

export const setTicketStateBlockObjectSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("set_ticket_state"),
  ticketId: z.string().min(1).optional(),
  statusId: z.string().min(1).optional(),
  statusName: z.string().min(1).max(128).optional(),
});

export const setTicketStateBlockSchema = setTicketStateBlockObjectSchema.refine(
  (val) => Boolean(val.statusId ?? val.statusName),
  {
    message: "statusId_or_statusName_required",
    path: ["statusId"],
  },
);

export type SetTicketStateBlock = z.infer<typeof setTicketStateBlockSchema>;

export type SetTicketStateInput = {
  ticketId?: string;
  statusId?: string;
  statusName?: string;
};

export type SetTicketStateResult = {
  ticketId: string;
  statusId: string;
  statusName?: string | null;
};
