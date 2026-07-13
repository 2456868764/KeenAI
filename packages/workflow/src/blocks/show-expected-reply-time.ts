import { z } from "zod";

export const showExpectedReplyTimeBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("show_expected_reply_time"),
  policyId: z.string().min(1).optional(),
  fallbackMinutes: z.number().int().min(1).max(20_160).default(240),
  insideOfficeHoursText: z.string().min(1).max(1_000).optional(),
  outsideOfficeHoursText: z.string().min(1).max(1_000).optional(),
});

export type ShowExpectedReplyTimeBlock = z.infer<typeof showExpectedReplyTimeBlockSchema>;

export type ShowExpectedReplyTimeInput = {
  policyId?: string;
  fallbackMinutes: number;
  insideOfficeHoursText?: string;
  outsideOfficeHoursText?: string;
};

export type ShowExpectedReplyTimeResult = {
  plainText: string;
  expectedReplyMinutes: number;
  insideOfficeHours?: boolean;
  policyId?: string;
  policyName?: string;
};
