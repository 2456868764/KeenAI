#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KEENAI_EXPOSE_TOOLS } from "./expose.js";

const server = new McpServer({ name: "keenai", version: "0.2.0" });

for (const tool of KEENAI_EXPOSE_TOOLS) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: z.object({}).passthrough(),
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            tool: tool.name,
            status: "stub",
            message: "Wire API dispatch in a later sprint; args received.",
            args,
          }),
        },
      ],
    }),
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
