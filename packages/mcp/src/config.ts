import { fileURLToPath } from "node:url";
import { z } from "zod";
import { resolveBunCommand } from "./runtime.js";
import {
  type McpHostConfig,
  type McpStdioServerConfig,
  mcpStdioServerConfigSchema,
} from "./types.js";

const mcpServersJsonSchema = z.array(mcpStdioServerConfigSchema);

export function defaultStubServerConfig(): McpStdioServerConfig {
  const stubPath = fileURLToPath(new URL("./stub-server.ts", import.meta.url));
  return {
    id: "stub",
    command: resolveBunCommand(),
    args: [stubPath],
  };
}

export function parseMcpServersJson(raw: string | undefined): McpStdioServerConfig[] {
  if (!raw?.trim()) return [defaultStubServerConfig()];
  const parsed = JSON.parse(raw) as unknown;
  return mcpServersJsonSchema.parse(parsed);
}

export function resolveMcpHostConfig(input: {
  enabled?: boolean;
  serversJson?: string;
}): McpHostConfig {
  if (!input.enabled) {
    return { enabled: false, servers: [] };
  }
  return {
    enabled: true,
    servers: parseMcpServersJson(input.serversJson),
  };
}
