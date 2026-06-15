/** Tools KeenAI exposes when running as an MCP Server (stdio). */
export type KeenaiExposeTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const KEENAI_EXPOSE_TOOLS: KeenaiExposeTool[] = [
  {
    name: "keenai_search_help",
    description: "Search published Help Center articles for a brand workspace.",
    inputSchema: {
      type: "object",
      properties: {
        brandId: { type: "string", description: "Brand id" },
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
      },
      required: ["brandId", "query"],
    },
  },
  {
    name: "keenai_list_tickets",
    description: "List tickets in the current organization.",
    inputSchema: {
      type: "object",
      properties: {
        statusId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
    },
  },
  {
    name: "keenai_get_conversation",
    description: "Fetch conversation metadata and recent messages.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "keenai_run_custom_action",
    description: "Execute a configured Custom Action by name for a brand.",
    inputSchema: {
      type: "object",
      properties: {
        brandId: { type: "string" },
        actionName: { type: "string" },
        parameters: { type: "object", additionalProperties: true },
      },
      required: ["brandId", "actionName"],
    },
  },
];

export function listKeenaiExposeTools(): KeenaiExposeTool[] {
  return KEENAI_EXPOSE_TOOLS;
}

export function getKeenaiExposeServerCommand(): string {
  return "bun packages/mcp/src/server.ts";
}
