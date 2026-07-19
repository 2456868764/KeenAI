import { z } from "zod";
import type { WorkflowRunContext } from "../schema.js";
import type { WorkflowFacts } from "./branches.js";

export const scriptBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("script"),
  code: z.string().min(1).max(10_000),
  timeoutMs: z.number().int().min(1).max(5_000).default(2_000),
  memoryMb: z.number().int().min(1).max(128).default(32),
});

export type ScriptBlock = z.infer<typeof scriptBlockSchema>;

export type ScriptInput = {
  code: string;
  timeoutMs: number;
  memoryMb: number;
  context?: WorkflowRunContext;
  facts: WorkflowFacts;
};

export type ScriptResult = {
  result: unknown;
};
