import type { ChannelConnectionConfig, ChannelOutboundEnvelope } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetChannelPluginRegistryForTests();
});

describe("channel provider reply projection", () => {
  it("projects Telegram reply parameters", async () => {
    const fetchMock = providerFetch({ ok: true, result: { message_id: 99 } });
    await send("telegram", { botToken: "token" }, "42", fetchMock);
    expect(requestBody(fetchMock)).toMatchObject({ reply_parameters: { message_id: 42 } });
  });

  it("projects Telegram forum topic IDs", async () => {
    const fetchMock = providerFetch({ ok: true, result: { message_id: 99 } });
    await send("telegram", { botToken: "token" }, undefined, fetchMock, {
      providerThreadId: "777",
    });
    expect(requestBody(fetchMock)).toMatchObject({ message_thread_id: 777 });
  });

  it("rejects a Telegram business error returned with HTTP 200", async () => {
    const fetchMock = providerFetch({
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    });

    await expect(send("telegram", { botToken: "token" }, undefined, fetchMock)).rejects.toThrow(
      "Bad Request: chat not found",
    );
  });

  it("projects Slack thread timestamps", async () => {
    const fetchMock = providerFetch({ ok: true, ts: "2.0" });
    await send("slack", { botToken: "token" }, "1.0", fetchMock);
    expect(requestBody(fetchMock)).toMatchObject({ thread_ts: "1.0" });
  });

  it("rejects a Provider success response without a real message id", async () => {
    const fetchMock = providerFetch({ ok: true });

    await expect(send("slack", { botToken: "token" }, undefined, fetchMock)).rejects.toThrow(
      "slack_provider_message_id_missing",
    );
  });

  it("projects Discord message references", async () => {
    const fetchMock = providerFetch({ id: "message-2" });
    await send("discord", { botToken: "token" }, "message-1", fetchMock);
    expect(requestBody(fetchMock)).toMatchObject({
      message_reference: { message_id: "message-1" },
    });
  });

  it("uses Feishu's reply endpoint", async () => {
    const fetchMock = providerFetch({ code: 0, data: { message_id: "message-2" } });
    await send("feishu", { tenantAccessToken: "token" }, "message-1", fetchMock);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/messages/message-1/reply");
    expect(requestBody(fetchMock)).not.toHaveProperty("receive_id");
  });

  it("projects WhatsApp message context", async () => {
    const fetchMock = providerFetch({ messages: [{ id: "message-2" }] });
    await send(
      "whatsapp",
      { accessToken: "token", phoneNumberId: "phone-1" },
      "message-1",
      fetchMock,
    );
    expect(requestBody(fetchMock)).toMatchObject({ context: { message_id: "message-1" } });
  });

  it("rejects a WeChat send without an explicit zero error code", async () => {
    const fetchMock = providerFetch({});
    await expect(send("wechat", { accessToken: "token" }, undefined, fetchMock)).rejects.toThrow(
      "wechat_message_send_failed",
    );
  });
});

async function send(
  channelType: ChannelConnectionConfig["channelType"],
  credentials: Record<string, unknown>,
  replyToProviderMessageId: string | undefined,
  fetchMock: ReturnType<typeof providerFetch>,
  channelAttributes?: Record<string, unknown>,
) {
  vi.stubGlobal("fetch", fetchMock);
  await getChannelPluginRegistry()
    .get(channelType)
    .send(envelope(channelType, replyToProviderMessageId, channelAttributes), {
      connectionId: `${channelType}-1`,
      orgId: "org-1",
      brandId: "brand-1",
      channelType,
      credentials,
      settings: {},
    });
}

function envelope(
  channelType: ChannelOutboundEnvelope["channelType"],
  replyToProviderMessageId: string | undefined,
  channelAttributes?: Record<string, unknown>,
): ChannelOutboundEnvelope {
  return {
    deliveryId: "delivery-1",
    orgId: "org-1",
    brandId: "brand-1",
    connectionId: `${channelType}-1`,
    conversationId: "conversation-1",
    messageId: "message-2",
    channelType,
    externalThreadId: "thread-1",
    replyToProviderMessageId,
    parts: [{ type: "text", text: "Reply" }],
    metadata: channelAttributes ? { channelAttributes } : undefined,
  };
}

function providerFetch(payload: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function requestBody(fetchMock: ReturnType<typeof providerFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}
