import { z } from "zod";

export const snoozeBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("snooze"),
  minutes: z.number().int().min(1).max(43_200),
});

export type SnoozeBlock = z.infer<typeof snoozeBlockSchema>;

export type SnoozeInput = {
  minutes: number;
};
