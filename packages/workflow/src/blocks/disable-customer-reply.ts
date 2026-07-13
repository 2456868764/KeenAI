import { z } from "zod";

export const disableCustomerReplyBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("disable_customer_reply"),
  disabled: z.boolean().default(true),
  reason: z.string().trim().min(1).max(240).optional(),
});

export type DisableCustomerReplyBlock = z.infer<typeof disableCustomerReplyBlockSchema>;

export type DisableCustomerReplyInput = {
  disabled: boolean;
  reason?: string;
};

export type DisableCustomerReplyResult = {
  disabled: boolean;
  reason?: string;
};
