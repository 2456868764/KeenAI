import { z } from "zod";

export const listPortalTicketsSchema = z.object({
  customerId: z.string().email(),
});
