import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowActionHandlers } from "./workflow-handlers.js";

const callTool = vi.fn();

vi.mock("./mcp-tools.js", () => ({
  getSharedMcpHost: vi.fn(async () => ({ callTool })),
}));

describe("workflow action handlers", () => {
  it("calls configured MCP server tools from mcp_call blocks", async () => {
    callTool.mockResolvedValueOnce({ echoed: "hello-mcp" });

    const handlers = createWorkflowActionHandlers(
      {} as never,
      { id: "workflow-1", orgId: "org-1" } as never,
      { id: "conversation-1", brandId: "brand-1" } as never,
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:", MCP_HOST_ENABLED: "true" }),
      undefined,
      "run-1",
    );

    const result = await handlers.mcpCall?.({
      serverId: "stub",
      toolName: "echo",
      arguments: { message: "hello-mcp" },
    });

    expect(callTool).toHaveBeenCalledWith("stub", "echo", { message: "hello-mcp" });
    expect(result).toEqual({
      serverId: "stub",
      toolName: "echo",
      result: { echoed: "hello-mcp" },
    });
  });
});
