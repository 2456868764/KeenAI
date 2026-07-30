import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowActionHandlers,
  mergeConversationTags,
  mergeEndUserTags,
  runWorkflowScriptBlock,
} from "./workflow-handlers.js";

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

  it("keeps workflow script blocks disabled by default", () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });

    expect(() =>
      runWorkflowScriptBlock(env, {
        code: "return 1;",
        timeoutMs: 1000,
        memoryMb: 32,
        facts: {},
      }),
    ).toThrow("workflow_script_disabled");
  });

  it("runs enabled workflow script blocks in a timeout-limited vm context", () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      WORKFLOW_SCRIPT_ENABLED: "true",
    });

    const result = runWorkflowScriptBlock(env, {
      code: "return { channel: facts.channelType, workflowId: context.workflowId };",
      timeoutMs: 1000,
      memoryMb: 32,
      facts: { channelType: "email" },
      context: {
        workflowId: "workflow-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conversation-1",
      },
    });

    expect(result).toEqual({
      result: { channel: "email", workflowId: "workflow-1" },
    });
  });

  it("removes workflow tags in remove mode", () => {
    expect(
      mergeConversationTags(["vip", "trial", "billing"], { tags: ["trial"], mode: "remove" }),
    ).toEqual(["vip", "billing"]);
    expect(
      mergeEndUserTags(["vip", "trial", "billing"], { tags: ["vip", "billing"], mode: "remove" }),
    ).toEqual(["trial"]);
  });
});
