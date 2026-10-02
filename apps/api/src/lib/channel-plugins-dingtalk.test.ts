import type { ChannelConnectionConfig, ChannelOutboundEnvelope } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetChannelPluginRegistryForTests();
});

describe("DingTalk OpenAPI outbound execution", () => {
  it("sends group messages through the robot OpenAPI and keeps the process query key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ processQueryKey: "group-process-key" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("dingtalk")
      .send(
        envelope({ robotCode: "robot-code", conversationType: "2" }),
        connection({ accessToken: "access-token" }),
      );

    expect(result.providerMessageIds).toEqual(["group-process-key"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.dingtalk.com/v1.0/robot/groupMessages/send",
    );
    expect(requestBody(fetchMock)).toEqual({
      msgKey: "sampleText",
      msgParam: JSON.stringify({ content: "Hello" }),
      robotCode: "robot-code",
      openConversationId: "conversation-id",
    });
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-acs-dingtalk-access-token"),
    ).toBe("access-token");
  });

  it("sends direct messages to the inbound staff member", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ processQueryKey: "direct-process-key" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("dingtalk")
      .send(
        envelope({
          robotCode: "robot-code",
          conversationType: "1",
          senderStaffId: "staff-1",
        }),
        connection({ accessToken: "access-token" }),
      );

    expect(result.providerMessageIds).toEqual(["direct-process-key"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend",
    );
    expect(requestBody(fetchMock)).toMatchObject({ userIds: ["staff-1"] });
  });

  it("rejects a direct send when DingTalk filters the recipient", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ processQueryKey: "ignored", filteredStaffIdList: ["staff-1"] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getChannelPluginRegistry()
        .get("dingtalk")
        .send(
          envelope({
            robotCode: "robot-code",
            conversationType: "1",
            senderStaffId: "staff-1",
          }),
          connection({ accessToken: "access-token" }),
        ),
    ).rejects.toThrow("dingtalk_filteredStaffIdList");
  });

  it("rejects an accepted response without a recallable process query key", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})));

    await expect(
      getChannelPluginRegistry()
        .get("dingtalk")
        .send(
          envelope({ robotCode: "robot-code", conversationType: "2" }),
          connection({ accessToken: "access-token" }),
        ),
    ).rejects.toThrow("dingtalk_process_query_key_missing");
  });
});

function envelope(channelAttributes: Record<string, unknown>): ChannelOutboundEnvelope {
  return {
    deliveryId: "delivery-1",
    orgId: "org-1",
    brandId: "brand-1",
    connectionId: "dingtalk-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    channelType: "dingtalk",
    externalThreadId: "conversation-id",
    parts: [{ type: "text", text: "Hello" }],
    metadata: { channelAttributes },
  };
}

function connection(credentials: Record<string, unknown>): ChannelConnectionConfig {
  return {
    connectionId: "dingtalk-1",
    orgId: "org-1",
    brandId: "brand-1",
    channelType: "dingtalk",
    credentials,
    settings: {},
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}
