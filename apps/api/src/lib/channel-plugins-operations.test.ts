import type {
  ChannelConnectionConfig,
  ChannelMessageOperation,
  ChannelType,
} from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetChannelPluginRegistryForTests();
});

describe("channel provider message operations", () => {
  it("adds a Telegram reaction", async () => {
    const fetchMock = jsonFetch({ ok: true, result: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("telegram", "reaction.add", { providerMessageId: "42", emoji: "👍" }), {
      botToken: "telegram-token",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.telegram.org/bottelegram-token/setMessageReaction",
    );
    expect(requestBody(fetchMock)).toMatchObject({
      chat_id: "thread-1",
      message_id: 42,
      reaction: [{ type: "emoji", emoji: "👍" }],
    });
  });

  it("executes Telegram message operations through the originating Business connection", async () => {
    const fetchMock = jsonFetch({ ok: true, result: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("telegram", "delete", {
        providerMessageId: "42",
        channelAttributes: { businessConnectionId: "business-1" },
      }),
      { botToken: "telegram-token" },
    );

    expect(requestBody(fetchMock)).toMatchObject({
      chat_id: "thread-1",
      message_id: 42,
      business_connection_id: "business-1",
    });
  });

  it("rejects a Telegram business error returned with HTTP 200", async () => {
    const fetchMock = jsonFetch({
      ok: false,
      error_code: 400,
      description: "Bad Request: message to react not found",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute(operation("telegram", "reaction.add", { providerMessageId: "42", emoji: "👍" }), {
        botToken: "telegram-token",
      }),
    ).rejects.toThrow("Bad Request: message to react not found");
  });

  it("updates a Slack message", async () => {
    const fetchMock = jsonFetch({ ok: true, ts: "1700.01" });
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("slack", "edit", { providerMessageId: "1700.01" }), {
      botToken: "slack-token",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://slack.com/api/chat.update");
    expect(requestBody(fetchMock)).toMatchObject({
      channel: "thread-1",
      ts: "1700.01",
      text: "Updated answer",
    });
  });

  it("rejects a Slack operation without an explicit success envelope", async () => {
    vi.stubGlobal("fetch", jsonFetch({}));
    await expect(
      execute(operation("slack", "edit", { providerMessageId: "1700.01" }), {
        botToken: "slack-token",
      }),
    ).rejects.toThrow("slack_edit_failed");
  });

  it("deletes a Slack external-upload file with the file API", async () => {
    const fetchMock = jsonFetch({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("slack", "delete", {
        providerMessageId: "F123",
        providerAction: "files.uploadV2",
        providerResourceType: "file",
      }),
      { botToken: "slack-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://slack.com/api/files.delete");
    expect(requestBody(fetchMock)).toEqual({ file: "F123" });
  });

  it("edits a Telegram media caption using its originating action", async () => {
    const fetchMock = jsonFetch({ ok: true, result: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("telegram", "edit", {
        providerMessageId: "42",
        providerAction: "sendPhoto",
      }),
      { botToken: "telegram-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.telegram.org/bottelegram-token/editMessageCaption",
    );
    expect(requestBody(fetchMock)).toMatchObject({ message_id: 42, caption: "Updated answer" });
  });

  it.each([
    ["telegram", 4096, { botToken: "telegram-token" }, "telegram_edit_text_too_long"],
    ["slack", 4000, { botToken: "slack-token" }, "slack_edit_text_too_long"],
    ["discord", 2000, { botToken: "discord-token" }, "discord_edit_text_too_long"],
    ["feishu", 4000, { tenantAccessToken: "feishu-token" }, "feishu_edit_text_too_long"],
  ] as const)(
    "rejects an overlong %s edit without silently truncating it",
    async (channelType, limit, credentials, errorCode) => {
      const fetchMock = jsonFetch({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        execute(
          operation(channelType, "edit", {
            providerMessageId: channelType === "telegram" ? "42" : "provider-message-1",
            parts: [{ type: "text", text: "x".repeat(limit + 1) }],
          }),
          credentials,
        ),
      ).rejects.toThrow(errorCode);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("maps Unicode reactions to Slack emoji names", async () => {
    const fetchMock = jsonFetch({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("slack", "reaction.add", { providerMessageId: "1700.01", emoji: "👍" }),
      { botToken: "slack-token" },
    );

    expect(requestBody(fetchMock)).toMatchObject({ name: "+1" });
  });

  it("starts the Discord typing indicator", async () => {
    const fetchMock = noContentFetch();
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("discord", "typing"), { botToken: "discord-token" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://discord.com/api/v10/channels/thread-1/typing",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("deletes a Feishu message", async () => {
    const fetchMock = jsonFetch({ code: 0, msg: "success" });
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("feishu", "delete", { providerMessageId: "om_123" }), {
      tenantAccessToken: "feishu-token",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/im/v1/messages/om_123",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("rejects a Feishu operation without an explicit zero code", async () => {
    vi.stubGlobal("fetch", jsonFetch({}));
    await expect(
      execute(operation("feishu", "delete", { providerMessageId: "om_123" }), {
        tenantAccessToken: "feishu-token",
      }),
    ).rejects.toThrow("feishu_delete_failed");
  });

  it("adds a Feishu reaction with the provider emoji type", async () => {
    const fetchMock = jsonFetch({ code: 0, data: { reaction_id: "reaction-1" } });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("feishu", "reaction.add", { providerMessageId: "om_123", emoji: "👍" }),
      { tenantAccessToken: "feishu-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/im/v1/messages/om_123/reactions",
    );
    expect(requestBody(fetchMock)).toEqual({ reaction_type: { emoji_type: "THUMBSUP" } });
  });

  it("removes the bot's Feishu reaction after resolving its reaction id", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [
              {
                reaction_id: "reaction-1",
                operator: { operator_id: "app-1", operator_type: "app" },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, msg: "success" }));
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("feishu", "reaction.remove", { providerMessageId: "om_123", emoji: "👍" }),
      { tenantAccessToken: "feishu-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/im/v1/messages/om_123/reactions?reaction_type=THUMBSUP&page_size=50",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://open.feishu.cn/open-apis/im/v1/messages/om_123/reactions/reaction-1",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("treats an absent Feishu reaction as an idempotent removal", async () => {
    const fetchMock = jsonFetch({ code: 0, data: { items: [] } });
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("feishu", "reaction.remove", { emoji: "HEART" }), {
      tenantAccessToken: "feishu-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes a WhatsApp reaction with an empty emoji", async () => {
    const fetchMock = jsonFetch({ messages: [{ id: "wamid-operation" }] });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("whatsapp", "reaction.remove", {
        providerMessageId: "wamid-target",
        emoji: "👍",
      }),
      { accessToken: "whatsapp-token", phoneNumberId: "phone-1" },
    );

    expect(requestBody(fetchMock)).toMatchObject({
      type: "reaction",
      reaction: { message_id: "wamid-target", emoji: "" },
    });
  });

  it("starts a WhatsApp typing indicator for the latest inbound message", async () => {
    const fetchMock = jsonFetch({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("whatsapp", "typing", {
        providerMessageId: "wamid-inbound",
      }),
      { accessToken: "whatsapp-token", phoneNumberId: "phone-1" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v20.0/phone-1/messages");
    expect(requestBody(fetchMock)).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid-inbound",
      typing_indicator: { type: "text" },
    });
  });

  it("recalls a WeCom app message", async () => {
    const fetchMock = jsonFetch({ errcode: 0, errmsg: "ok" });
    vi.stubGlobal("fetch", fetchMock);

    await execute(operation("wecom", "delete", { providerMessageId: "wecom-message-1" }), {
      accessToken: "wecom-token",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://qyapi.weixin.qq.com/cgi-bin/message/recall?access_token=wecom-token",
    );
    expect(requestBody(fetchMock)).toEqual({ msgid: "wecom-message-1" });
  });

  it("rejects a WeCom recall without an explicit zero error code", async () => {
    vi.stubGlobal("fetch", jsonFetch({}));
    await expect(
      execute(operation("wecom", "delete", { providerMessageId: "wecom-message-1" }), {
        accessToken: "wecom-token",
      }),
    ).rejects.toThrow("wecom_message_recall_failed");
  });

  it("recalls a DingTalk group message using its processQueryKey", async () => {
    const fetchMock = jsonFetch({ successResult: ["process-key-1"], failedResult: {} });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("dingtalk", "delete", {
        providerMessageId: "process-key-1",
        channelAttributes: { robotCode: "robot-1", conversationType: "2" },
      }),
      { accessToken: "dingtalk-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.dingtalk.com/v1.0/robot/groupMessages/recall",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-acs-dingtalk-access-token": "dingtalk-token",
      }),
    });
    expect(requestBody(fetchMock)).toEqual({
      robotCode: "robot-1",
      openConversationId: "thread-1",
      processQueryKeys: ["process-key-1"],
    });
  });

  it("recalls a DingTalk direct message using the OTO endpoint", async () => {
    const fetchMock = jsonFetch({ successResult: ["process-key-2"], failedResult: {} });
    vi.stubGlobal("fetch", fetchMock);

    await execute(
      operation("dingtalk", "delete", {
        providerMessageId: "process-key-2",
        channelAttributes: { robotCode: "robot-1", conversationType: "1" },
      }),
      { accessToken: "dingtalk-token" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.dingtalk.com/v1.0/robot/otoMessages/batchRecall",
    );
    expect(requestBody(fetchMock)).toEqual({
      robotCode: "robot-1",
      processQueryKeys: ["process-key-2"],
    });
  });

  it("rejects a DingTalk recall without a real processQueryKey", async () => {
    const fetchMock = jsonFetch({ successResult: [], failedResult: {} });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute(
        operation("dingtalk", "delete", {
          providerMessageId: "dingtalk:ack:123:0",
          channelAttributes: { robotCode: "robot-1", conversationType: "2" },
        }),
        { accessToken: "dingtalk-token" },
      ),
    ).rejects.toThrow("dingtalk_process_query_key_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a DingTalk recall with an explicit provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch({
        successResult: [],
        failedResult: { "process-key-1": "MESSAGE_NOT_FOUND" },
      }),
    );
    await expect(
      execute(
        operation("dingtalk", "delete", {
          providerMessageId: "process-key-1",
          channelAttributes: { robotCode: "robot-1", conversationType: "2" },
        }),
        { accessToken: "dingtalk-token" },
      ),
    ).rejects.toThrow("MESSAGE_NOT_FOUND");
  });

  it("rejects unsupported DingTalk typing before a provider request", async () => {
    const fetchMock = jsonFetch({ errcode: 0 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(execute(operation("dingtalk", "typing"), {})).rejects.toThrow(
      "dingtalk_typing_not_supported",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function execute(
  input: ChannelMessageOperation,
  credentials: Record<string, unknown>,
): Promise<void> {
  const plugin = getChannelPluginRegistry().get(input.channelType);
  const connection: ChannelConnectionConfig = {
    connectionId: `${input.channelType}-connection`,
    orgId: "org-1",
    brandId: "brand-1",
    channelType: input.channelType,
    credentials,
    settings: {},
  };
  await plugin.executeMessageOperation?.(input, connection);
}

function operation(
  channelType: ChannelType,
  type: ChannelMessageOperation["type"],
  overrides: Record<string, unknown> = {},
): ChannelMessageOperation {
  const base = {
    type,
    orgId: "org-1",
    brandId: "brand-1",
    connectionId: `${channelType}-connection`,
    conversationId: "conversation-1",
    messageId: "message-1",
    channelType,
    externalThreadId: "thread-1",
    ...overrides,
  };
  if (type === "edit") {
    return {
      ...base,
      type,
      providerMessageId: String(overrides.providerMessageId ?? "provider-message-1"),
      parts: Array.isArray(overrides.parts)
        ? (overrides.parts as Extract<ChannelMessageOperation, { type: "edit" }>["parts"])
        : [{ type: "text", text: "Updated answer" }],
    };
  }
  if (type === "reaction.add" || type === "reaction.remove") {
    return {
      ...base,
      type,
      providerMessageId: String(overrides.providerMessageId ?? "provider-message-1"),
      emoji: String(overrides.emoji ?? "👍"),
    };
  }
  if (type === "delete") {
    return {
      ...base,
      type,
      providerMessageId: String(overrides.providerMessageId ?? "provider-message-1"),
    };
  }
  return { ...base, type };
}

function jsonFetch(payload: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(payload));
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function noContentFetch() {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
}

function requestBody(fetchMock: ReturnType<typeof jsonFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}
