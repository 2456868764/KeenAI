import type { ChannelConnectionConfig, ChannelOutboundEnvelope } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetChannelPluginRegistryForTests();
});

describe("channel provider interactive execution", () => {
  it("projects native button payloads for every IM provider", async () => {
    const cases: Array<{
      channel: ChannelConnectionConfig["channelType"];
      credentials: Record<string, unknown>;
      settings?: Record<string, unknown>;
      response: unknown;
      assertBody: (body: Record<string, unknown>) => void;
    }> = [
      {
        channel: "telegram",
        credentials: { botToken: "token" },
        response: { ok: true, result: { message_id: 1 } },
        assertBody: (body) => expect(body).toHaveProperty("reply_markup.inline_keyboard"),
      },
      {
        channel: "slack",
        credentials: { botToken: "token" },
        response: { ok: true, ts: "1.0" },
        assertBody: (body) => expect(body).toHaveProperty("blocks.1.elements.0.action_id", "sales"),
      },
      {
        channel: "discord",
        credentials: { botToken: "token" },
        response: { id: "message-1" },
        assertBody: (body) =>
          expect(body).toHaveProperty("components.0.components.0.custom_id", "sales"),
      },
      {
        channel: "feishu",
        credentials: { tenantAccessToken: "token" },
        response: { code: 0, data: { message_id: "message-1" } },
        assertBody: (body) => {
          expect(body.msg_type).toBe("interactive");
          expect(JSON.parse(String(body.content))).toHaveProperty(
            "elements.1.actions.0.value.keenai_button_id",
            "sales",
          );
        },
      },
      {
        channel: "dingtalk",
        credentials: {},
        settings: { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" },
        response: { errcode: 0, processQueryKey: "message-1" },
        assertBody: (body) => expect(body).toHaveProperty("actionCard.btns.0.title", "Sales"),
      },
      {
        channel: "whatsapp",
        credentials: { accessToken: "token", phoneNumberId: "phone-1" },
        response: { messages: [{ id: "message-1" }] },
        assertBody: (body) =>
          expect(body).toHaveProperty("interactive.action.buttons.0.reply.id", "sales"),
      },
      {
        channel: "wecom",
        credentials: { accessToken: "token" },
        settings: { wecomAgentId: 1001 },
        response: { errcode: 0, msgid: "message-1" },
        assertBody: (body) =>
          expect(body).toHaveProperty("template_card.button_list.0.key", "sales"),
      },
      {
        channel: "wechat",
        credentials: { accessToken: "token" },
        response: { errcode: 0, msgid: "message-1" },
        assertBody: (body) => expect(body).toHaveProperty("msgmenu.list.0.id", "sales"),
      },
    ];

    for (const testCase of cases) {
      const fetchMock = providerFetch(testCase.response);
      vi.stubGlobal("fetch", fetchMock);
      await getChannelPluginRegistry()
        .get(testCase.channel)
        .send(interactiveEnvelope(testCase.channel), {
          connectionId: `${testCase.channel}-1`,
          orgId: "org-1",
          brandId: "brand-1",
          channelType: testCase.channel,
          credentials: testCase.credentials,
          settings: testCase.settings ?? {},
        });
      testCase.assertBody(requestBody(fetchMock));
      vi.unstubAllGlobals();
      resetChannelPluginRegistryForTests();
    }
  });

  it("sends an approved WhatsApp template payload", async () => {
    const fetchMock = providerFetch({ messages: [{ id: "message-1" }] });
    vi.stubGlobal("fetch", fetchMock);
    const envelope = interactiveEnvelope("whatsapp");
    envelope.directives = {
      whatsappTemplate: {
        name: "support_follow_up",
        languageCode: "en_US",
        components: [{ type: "body", parameters: [] }],
      },
    };

    await getChannelPluginRegistry()
      .get("whatsapp")
      .send(envelope, {
        connectionId: "whatsapp-1",
        orgId: "org-1",
        brandId: "brand-1",
        channelType: "whatsapp",
        credentials: { accessToken: "token", phoneNumberId: "phone-1" },
        settings: {},
      });

    expect(requestBody(fetchMock)).toMatchObject({
      type: "template",
      template: { name: "support_follow_up", language: { code: "en_US" } },
    });
  });

  it("sends Telegram replies through the originating Business connection", async () => {
    const fetchMock = providerFetch({ ok: true, result: { message_id: 1 } });
    vi.stubGlobal("fetch", fetchMock);
    const envelope = interactiveEnvelope("telegram");
    envelope.metadata = { channelAttributes: { businessConnectionId: "business-1" } };

    await getChannelPluginRegistry()
      .get("telegram")
      .send(envelope, {
        connectionId: "telegram-1",
        orgId: "org-1",
        brandId: "brand-1",
        channelType: "telegram",
        credentials: { botToken: "token" },
        settings: {},
      });

    expect(requestBody(fetchMock)).toMatchObject({
      chat_id: "thread-1",
      business_connection_id: "business-1",
    });
  });

  it("preserves all eight workflow choices across provider layout limits", async () => {
    const cases: Array<{
      channel: "slack" | "feishu" | "dingtalk" | "whatsapp" | "wecom";
      credentials: Record<string, unknown>;
      settings?: Record<string, unknown>;
      response: unknown;
      assertBodies: (bodies: Record<string, unknown>[]) => void;
    }> = [
      {
        channel: "slack",
        credentials: { botToken: "token" },
        response: { ok: true, ts: "1.0" },
        assertBodies: ([body]) => {
          const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
          const count = blocks.reduce<number>(
            (total, block) =>
              total +
              (isRecord(block) && Array.isArray(block.elements) ? block.elements.length : 0),
            0,
          );
          expect(count).toBe(8);
        },
      },
      {
        channel: "feishu",
        credentials: { tenantAccessToken: "token" },
        response: { code: 0, data: { message_id: "message-1" } },
        assertBodies: ([body]) => {
          const card = JSON.parse(String(body?.content)) as { elements?: unknown[] };
          const count = (card.elements ?? []).reduce<number>(
            (total, element) =>
              total +
              (isRecord(element) && Array.isArray(element.actions) ? element.actions.length : 0),
            0,
          );
          expect(count).toBe(8);
        },
      },
      {
        channel: "dingtalk",
        credentials: {},
        settings: { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" },
        response: { errcode: 0, processQueryKey: "message-1" },
        assertBodies: (bodies) => {
          expect(bodies).toHaveLength(2);
          expect(bodies.map((body) => nestedArrayLength(body, "actionCard", "btns"))).toEqual([
            5, 3,
          ]);
        },
      },
      {
        channel: "whatsapp",
        credentials: { accessToken: "token", phoneNumberId: "phone-1" },
        response: { messages: [{ id: "message-1" }] },
        assertBodies: ([body]) => {
          expect(body).toHaveProperty("interactive.type", "list");
          expect(body).toHaveProperty("interactive.action.sections.0.rows");
          expect(nestedArrayLength(body, "interactive", "action", "sections", 0, "rows")).toBe(8);
        },
      },
      {
        channel: "wecom",
        credentials: { accessToken: "token" },
        settings: { wecomAgentId: 1001 },
        response: { errcode: 0, msgid: "message-1" },
        assertBodies: (bodies) => {
          expect(bodies).toHaveLength(2);
          expect(
            bodies.map((body) => nestedArrayLength(body, "template_card", "button_list")),
          ).toEqual([6, 2]);
        },
      },
    ];

    for (const testCase of cases) {
      const fetchMock = providerFetch(testCase.response);
      vi.stubGlobal("fetch", fetchMock);
      await getChannelPluginRegistry()
        .get(testCase.channel)
        .send(eightChoiceEnvelope(testCase.channel), {
          connectionId: `${testCase.channel}-1`,
          orgId: "org-1",
          brandId: "brand-1",
          channelType: testCase.channel,
          credentials: testCase.credentials,
          settings: testCase.settings ?? {},
        });
      testCase.assertBodies(requestBodies(fetchMock));
      vi.unstubAllGlobals();
      resetChannelPluginRegistryForTests();
    }
  });

  it("rejects DingTalk action cards without a reachable button URL", async () => {
    const fetchMock = providerFetch({ errcode: 0 });
    vi.stubGlobal("fetch", fetchMock);
    const envelope = interactiveEnvelope("dingtalk");
    envelope.directives = {
      interaction: { buttons: [{ id: "sales", label: "Sales" }] },
    };

    await expect(
      getChannelPluginRegistry()
        .get("dingtalk")
        .send(envelope, {
          connectionId: "dingtalk-1",
          orgId: "org-1",
          brandId: "brand-1",
          channelType: "dingtalk",
          credentials: {},
          settings: { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" },
        }),
    ).rejects.toThrow("dingtalk_button_url_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a DingTalk response without an explicit zero error code", async () => {
    const fetchMock = providerFetch({});
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getChannelPluginRegistry()
        .get("dingtalk")
        .send(interactiveEnvelope("dingtalk"), {
          connectionId: "dingtalk-1",
          orgId: "org-1",
          brandId: "brand-1",
          channelType: "dingtalk",
          credentials: {},
          settings: { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" },
        }),
    ).rejects.toThrow("dingtalk_message_send_failed");
  });

  it("classifies a failed multi-action send after partial success as unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse({ errcode: 0, processQueryKey: "message-1" }))
      .mockResolvedValueOnce(providerResponse({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const plugin = getChannelPluginRegistry().get("dingtalk");
    const envelope = eightChoiceEnvelope("dingtalk");

    let failure: unknown;
    try {
      await plugin.send(envelope, {
        connectionId: "dingtalk-1",
        orgId: "org-1",
        brandId: "brand-1",
        channelType: "dingtalk",
        credentials: {},
        settings: { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" },
      });
    } catch (error) {
      failure = error;
    }

    expect(plugin.classifyError(failure)).toMatchObject({
      disposition: "unknown_after_send",
      code: "partial_delivery",
    });
    expect(failure).toMatchObject({
      partialDelivery: true,
      providerResponse: {
        completedActionCount: 1,
        failedActionIndex: 1,
        providerMessageIds: ["message-1"],
      },
    });
  });
});

function interactiveEnvelope(
  channelType: ChannelOutboundEnvelope["channelType"],
): ChannelOutboundEnvelope {
  return {
    deliveryId: "delivery-1",
    orgId: "org-1",
    brandId: "brand-1",
    connectionId: `${channelType}-1`,
    conversationId: "conversation-1",
    messageId: "message-1",
    channelType,
    externalThreadId: "thread-1",
    parts: [{ type: "text", text: "Choose a team" }],
    directives: {
      interaction: {
        buttons: [
          { id: "sales", label: "Sales", callbackUrl: "https://app.example/action/sales" },
          { id: "support", label: "Support", callbackUrl: "https://app.example/action/support" },
        ],
      },
    },
  };
}

function eightChoiceEnvelope(
  channelType: ChannelOutboundEnvelope["channelType"],
): ChannelOutboundEnvelope {
  const envelope = interactiveEnvelope(channelType);
  envelope.directives = {
    interaction: {
      buttons: Array.from({ length: 8 }, (_, index) => ({
        id: `choice-${index + 1}`,
        label: `Choice ${index + 1}`,
        callbackUrl: `https://app.example/action/choice-${index + 1}`,
      })),
    },
  };
  return envelope;
}

function providerFetch(payload: unknown) {
  return vi.fn<typeof fetch>().mockImplementation(async () => providerResponse(payload));
}

function providerResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(fetchMock: ReturnType<typeof providerFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}

function requestBodies(fetchMock: ReturnType<typeof providerFetch>): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
  );
}

function nestedArrayLength(value: unknown, ...path: Array<string | number>): number {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      current = Array.isArray(current) ? current[segment] : undefined;
    } else {
      current = isRecord(current) ? current[segment] : undefined;
    }
  }
  return Array.isArray(current) ? current.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
