import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "keenai-mcp-stub", version: "0.0.1" });

server.registerTool(
  "echo",
  {
    description: "Echo the input message back",
    inputSchema: { message: z.string() },
  },
  async ({ message }) => ({
    content: [{ type: "text", text: message }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
