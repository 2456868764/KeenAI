import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  extractMcpToolResult,
  normalizeMcpToolInputSchema,
  qualifyMcpToolName,
} from "./tool-utils.js";
import type { McpListedTool, McpStdioServerConfig } from "./types.js";

type ConnectedServer = {
  config: McpStdioServerConfig;
  client: Client;
  transport: StdioClientTransport;
};

/** MCP Host client — connects to external stdio MCP servers (Sprint 16 · CA-06). */
export class McpHost {
  private readonly servers = new Map<string, ConnectedServer>();

  async connectServer(config: McpStdioServerConfig): Promise<void> {
    if (this.servers.has(config.id)) return;

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
      stderr: "ignore",
    });
    const client = new Client({ name: "keenai-mcp-host", version: "0.1.0" });
    await client.connect(transport);
    this.servers.set(config.id, { config, client, transport });
  }

  async connectAll(configs: McpStdioServerConfig[]): Promise<void> {
    for (const config of configs) {
      await this.connectServer(config);
    }
  }

  async listTools(serverId?: string): Promise<McpListedTool[]> {
    const targets = serverId
      ? [this.servers.get(serverId)].filter(Boolean)
      : [...this.servers.values()];

    const listed: McpListedTool[] = [];
    for (const entry of targets) {
      if (!entry) continue;
      const response = await entry.client.listTools();
      for (const tool of response.tools) {
        listed.push({
          serverId: entry.config.id,
          name: tool.name,
          qualifiedName: qualifyMcpToolName(entry.config.id, tool.name),
          description: tool.description ?? tool.name,
          inputSchema: normalizeMcpToolInputSchema(
            tool.inputSchema as Record<string, unknown> | undefined,
          ),
        });
      }
    }
    return listed;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.servers.get(serverId);
    if (!entry) throw new Error("mcp_server_not_connected");
    const result = await entry.client.callTool({ name: toolName, arguments: args });
    return extractMcpToolResult(result);
  }

  getConnectedServerIds(): string[] {
    return [...this.servers.keys()];
  }

  async close(): Promise<void> {
    for (const entry of this.servers.values()) {
      await entry.transport.close();
    }
    this.servers.clear();
  }
}
