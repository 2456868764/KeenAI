const SLUG_RE = /[^a-z0-9]+/g;

/** Build a copilot-safe tool name: mcp_{server}__{tool}. */
export function qualifyMcpToolName(serverId: string, toolName: string): string {
  const server = serverId.toLowerCase().replace(SLUG_RE, "_").replace(/^_|_$/g, "");
  const tool = toolName.toLowerCase().replace(SLUG_RE, "_").replace(/^_|_$/g, "");
  return `mcp_${server}__${tool}`;
}

export function normalizeMcpToolInputSchema(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  if (schema.type === "object") return schema;
  return { type: "object", properties: {} };
}

export function extractMcpToolResult(result: unknown): unknown {
  const value = result as {
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  if (value.isError) {
    const text = value.content?.find((part) => part.type === "text")?.text;
    throw new Error(text ?? "mcp_tool_error");
  }
  if (value.structuredContent !== undefined) return value.structuredContent;
  const textPart = value.content?.find((part) => part.type === "text");
  if (textPart?.text !== undefined) return textPart.text;
  return value.content ?? null;
}
