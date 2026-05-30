import { z } from "zod";

export const mcpStdioServerConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, "id must be lowercase slug"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

export type McpStdioServerConfig = z.infer<typeof mcpStdioServerConfigSchema>;

export type McpListedTool = {
  serverId: string;
  name: string;
  qualifiedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpHostConfig = {
  enabled: boolean;
  servers: McpStdioServerConfig[];
};
