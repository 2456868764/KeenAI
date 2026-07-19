import { z } from "zod";

export const mcpCallBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("mcp_call"),
  serverId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, "serverId must be lowercase slug"),
  toolName: z.string().min(1).max(128),
  arguments: z.record(z.unknown()).default({}),
});

export type McpCallBlock = z.infer<typeof mcpCallBlockSchema>;

export type McpCallInput = {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type McpCallResult = {
  serverId: string;
  toolName: string;
  result: unknown;
};
