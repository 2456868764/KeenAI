import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowActionHandlers,
  mergeConversationTags,
  mergeEndUserTags,
  runWorkflowScriptBlock,
} from "./workflow-handlers.js";

const { callTool, executeWorkflowToolCall, insertMessage } = vi.hoisted(() => ({
  callTool: vi.fn(),
  insertMessage: vi.fn(async () => ({ message: { id: "message-1" } })),
  executeWorkflowToolCall: vi.fn(async (_db, input) => ({
    runId: "agent-run-1",
    status: "completed" as const,
    result: await input.tool.execute(input.arguments),
  })),
}));

vi.mock("./mcp-tools.js", () => ({
  getSharedMcpHost: vi.fn(async () => ({
    callTool,
    listTools: vi.fn(async () => [
      {
        name: "echo",
        qualifiedName: "mcp__stub__echo",
        description: "Echo a value",
        inputSchema: { type: "object" },
      },
    ]),
  })),
}));

vi.mock("./workflow-tool-runtime.js", () => ({ executeWorkflowToolCall }));

vi.mock("./conversations.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conversations.js")>()),
  insertMessage,
}));

describe("workflow action handlers", () => {
  it("persists WhatsApp templates as outbound directives", async () => {
    const handlers = createWorkflowActionHandlers(
      {} as never,
      { id: "workflow-1", orgId: "org-1" } as never,
      {
        id: "conversation-1",
        brandId: "brand-1",
        channelType: "whatsapp",
      } as never,
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" }),
      undefined,
      "run-1",
    );
    const whatsappTemplate = {
      name: "support_follow_up",
      languageCode: "en_US",
      components: [{ type: "body", parameters: [] }],
    };

    await handlers.sendMessage({ whatsappTemplate });

    expect(insertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plainText: "[WhatsApp template: support_follow_up]",
        content: {
          type: "text",
          text: "[WhatsApp template: support_follow_up]",
          outboundDirectives: { whatsappTemplate },
        },
        sentVia: "workflow",
      }),
    );
  });

  it("rejects WhatsApp templates for non-WhatsApp conversations", async () => {
    const handlers = createWorkflowActionHandlers(
      {} as never,
      { id: "workflow-1", orgId: "org-1" } as never,
      { id: "conversation-1", brandId: "brand-1", channelType: "slack" } as never,
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" }),
      undefined,
      "run-1",
    );

    await expect(
      handlers.sendMessage({
        whatsappTemplate: { name: "support_follow_up", languageCode: "en_US" },
      }),
    ).rejects.toThrow("whatsapp_template_channel_required");
  });

  it("rejects WhatsApp templates mixed with ordinary content", async () => {
    const handlers = createWorkflowActionHandlers(
      {} as never,
      { id: "workflow-1", orgId: "org-1" } as never,
      {
        id: "conversation-1",
        brandId: "brand-1",
        channelType: "whatsapp",
      } as never,
      parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" }),
      undefined,
      "run-1",
    );

    await expect(
      handlers.sendMessage({
        plainText: "Ignored text",
        whatsappTemplate: { name: "support_follow_up", languageCode: "en_US" },
      }),
    ).rejects.toThrow("whatsapp_template_content_conflict");
  });

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
      governance: { agentRunId: "agent-run-1", status: "completed" },
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
