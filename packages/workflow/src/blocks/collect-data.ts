import { z } from "zod";

const COLLECT_DATA_AUTO_CLOSE_MINUTES = [1, 3, 5, 7, 10, 15, 30, 60] as const;

export const collectDataFieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  required: z.boolean().default(true),
});

export const collectDataBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("collect_data"),
  prompt: z.string().min(1).max(2000),
  allowFreeText: z.boolean().default(false),
  fields: z.array(collectDataFieldSchema).min(1).max(8),
  autoCloseMinutes: z
    .number()
    .int()
    .refine((v) => (COLLECT_DATA_AUTO_CLOSE_MINUTES as readonly number[]).includes(v), {
      message: "invalid_auto_close_minutes",
    })
    .optional(),
});

export type CollectDataBlock = z.infer<typeof collectDataBlockSchema>;
export type CollectDataField = z.infer<typeof collectDataFieldSchema>;

export type CollectDataInput = {
  blockId: string;
  prompt: string;
  allowFreeText: boolean;
  fields: CollectDataField[];
  workflowRunId?: string;
  autoCloseMinutes?: number;
};

export type CollectDataSubmission = {
  attributes: Record<string, string>;
  freeText?: string;
};
