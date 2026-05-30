import type { DraftToolRuntime } from "@keenai/llm";
import { McpHost, resolveMcpHostConfig } from "@keenai/mcp";
import type { ApiEnv } from "@keenai/shared";

const MAX_MCP_TOOLS = 10;

let sharedHost: McpHost | null = null;
let sharedHostKey: string | null = null;

function hostCacheKey(env: ApiEnv): string {
  return `${env.MCP_HOST_ENABLED}:${env.MCP_SERVERS ?? ""}`;
}

export async function getSharedMcpHost(env: ApiEnv): Promise<McpHost | null> {
  const config = resolveMcpHostConfig({
    enabled: env.MCP_HOST_ENABLED,
    serversJson: env.MCP_SERVERS,
  });
  if (!config.enabled) return null;

  const key = hostCacheKey(env);
  if (sharedHost && sharedHostKey === key) return sharedHost;

  if (sharedHost) await sharedHost.close();

  const host = new McpHost();
  await host.connectAll(config.servers);
  sharedHost = host;
  sharedHostKey = key;
  return host;
}

/** Reset cached host — for tests. */
export async function resetSharedMcpHost(): Promise<void> {
  if (sharedHost) await sharedHost.close();
  sharedHost = null;
  sharedHostKey = null;
}

export async function loadMcpDraftTools(env: ApiEnv): Promise<DraftToolRuntime[]> {
  const host = await getSharedMcpHost(env);
  if (!host) return [];

  const listed = await host.listTools();
  return listed.slice(0, MAX_MCP_TOOLS).map((tool) => ({
    name: tool.qualifiedName,
    description: `[MCP:${tool.serverId}] ${tool.description}`,
    parametersSchema: tool.inputSchema,
    execute: async (args: Record<string, unknown>) => host.callTool(tool.serverId, tool.name, args),
  }));
}

export function listConfiguredMcpServers(env: ApiEnv): Array<{ id: string; command: string }> {
  const config = resolveMcpHostConfig({
    enabled: env.MCP_HOST_ENABLED,
    serversJson: env.MCP_SERVERS,
  });
  return config.servers.map((server) => ({ id: server.id, command: server.command }));
}
