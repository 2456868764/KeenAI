import { describe, expect, it } from "vitest";
import {
  acceptanceConfig,
  runChannelProviderAcceptance,
} from "../../../scripts/channel-provider-acceptance.mjs";

describe("channel provider acceptance", () => {
  it("requires every requested roundtrip probe", () => {
    expect(() =>
      acceptanceConfig({
        KEENAI_ACCEPTANCE_MODE: "roundtrip",
        KEENAI_ACCEPTANCE_CHANNELS: "slack,email",
        KEENAI_ACCEPTANCE_PROBES_JSON: JSON.stringify({ slack: {} }),
      }),
    ).toThrow("missing_roundtrip_probes:email");
  });

  it("checks provider connections and a durable delivery roundtrip", async () => {
    let messagePolls = 0;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const response = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      if (parsed.pathname.endsWith("/auth/login")) {
        expect(init?.body).not.toContain("undefined");
        return response({ accessToken: "secret-token", brandIds: ["brand-1"] });
      }
      if (parsed.pathname.endsWith("/channel-connections")) {
        return response({
          items: [
            {
              id: "slack-1",
              channelType: "slack",
              status: "active",
              name: "Production Slack",
              transport: "webhook",
            },
          ],
        });
      }
      if (parsed.pathname.endsWith("/channel-connections/slack-1/test")) {
        return response({ result: { ok: true, verification: "provider" } });
      }
      if (parsed.pathname.endsWith("/conversations/conversation-1")) {
        return response({ conversation: { id: "conversation-1", channelType: "slack" } });
      }
      if (parsed.pathname.endsWith("/conversations/conversation-1/messages")) {
        if (init?.method === "POST") {
          return response({ message: { id: "outbound-1", deliveryStatus: "pending" } }, 201);
        }
        messagePolls += 1;
        return response({
          items: [
            {
              id: "inbound-1",
              senderType: "user",
              plainText: "probe-slack-123",
              createdAt: new Date().toISOString(),
              deletedAt: null,
            },
            ...(messagePolls > 1
              ? [
                  { id: "outbound-1", senderType: "agent", deliveryStatus: "delivered" },
                  {
                    id: "outbound-ack-1",
                    senderType: "user",
                    plainText: "ack-slack-123",
                    createdAt: new Date().toISOString(),
                    deletedAt: null,
                  },
                ]
              : []),
          ],
        });
      }
      return response({ error: "not_found" }, 404);
    };

    const config = acceptanceConfig({
      KEENAI_API_URL: "http://keenai.test",
      KEENAI_ACCEPTANCE_EMAIL: "owner@example.com",
      KEENAI_ACCEPTANCE_PASSWORD: "password12345",
      KEENAI_ACCEPTANCE_ORG_SLUG: "acme",
      KEENAI_ACCEPTANCE_CHANNELS: "slack",
      KEENAI_ACCEPTANCE_MODE: "roundtrip",
      KEENAI_ACCEPTANCE_PROBES_JSON: JSON.stringify({
        slack: {
          conversationId: "conversation-1",
          inboundToken: "probe-slack-123",
          outboundAckToken: "ack-slack-123",
          outboundText: "KeenAI Slack acceptance response",
        },
      }),
      KEENAI_ACCEPTANCE_POLL_INTERVAL_MS: "1",
      KEENAI_ACCEPTANCE_TIMEOUT_MS: "1000",
    });
    const report = await runChannelProviderAcceptance(config, {
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(report.passed).toBe(true);
    expect(report.channels[0]).toMatchObject({
      channel: "slack",
      passed: true,
      roundtrip: { deliveryStatus: "delivered" },
    });
  });

  it("checks Feishu mutable and receipt capabilities in full mode", async () => {
    let edited = false;
    let reacted = false;
    let deleted = false;
    const outboundBodies: Record<string, unknown>[] = [];
    const response = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      if (path.endsWith("/me")) return response({ brandIds: ["brand-1"] });
      if (path.endsWith("/channel-connections")) {
        return response({
          items: [
            {
              id: "feishu-1",
              channelType: "feishu",
              status: "active",
              name: "Production Feishu",
              transport: "webhook",
            },
          ],
        });
      }
      if (path.endsWith("/channel-connections/feishu-1/test")) {
        return response({ result: { ok: true, verification: "provider" } });
      }
      if (path.endsWith("/conversations/conversation-1")) {
        return response({
          conversation: {
            id: "conversation-1",
            channelType: "feishu",
            channelCapabilities: [
              "attachments",
              "threads",
              "interactive",
              "delivery_receipts",
              "read_receipts",
              "message_edit",
              "reactions",
              "message_delete",
            ],
          },
        });
      }
      if (path.endsWith("/uploads/presign")) {
        return response({ uploadUrl: "http://keenai.test/upload/test", uploadId: "upload-1" }, 201);
      }
      if (path === "/upload/test") {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBeInstanceOf(Uint8Array);
        return response({ attachmentId: "attachment-1" });
      }
      if (path.endsWith("/messages/outbound-1/reactions")) {
        reacted = init?.method === "PUT";
        return response({ enqueued: true }, 202);
      }
      if (path.endsWith("/messages/outbound-1")) {
        if (init?.method === "PATCH") edited = true;
        if (init?.method === "DELETE") deleted = true;
        return response({ enqueued: true }, 202);
      }
      if (path.endsWith("/conversations/conversation-1/messages")) {
        if (init?.method === "POST") {
          const outboundBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          outboundBodies.push(outboundBody);
          return response({ message: { id: "outbound-1", deliveryStatus: "pending" } }, 201);
        }
        return response({
          items: [
            {
              id: "inbound-1",
              senderType: "user",
              plainText: "probe-feishu-full",
              createdAt: new Date().toISOString(),
              deletedAt: null,
              attachments: [{ fileName: "provider-inbound.txt" }],
            },
            {
              id: "interactive-prompt-1",
              senderType: "agent",
              plainText: "Choose acceptance action",
              createdAt: new Date().toISOString(),
              deletedAt: null,
              content: {
                type: "workflow_reply_buttons",
                workflow: { buttons: [{ id: "accept", label: "Accept" }] },
              },
            },
            {
              id: "outbound-ack-1",
              senderType: "user",
              plainText: "ack-feishu-full",
              createdAt: new Date().toISOString(),
              deletedAt: null,
            },
            {
              id: "stale-interactive-complete",
              senderType: "agent",
              plainText: "Acceptance branch completed",
              createdAt: new Date(Date.now() - 30_000).toISOString(),
              deletedAt: null,
            },
            {
              id: "interactive-complete-1",
              senderType: "agent",
              plainText: "Acceptance branch completed",
              createdAt: new Date().toISOString(),
              deletedAt: null,
            },
            {
              id: "outbound-1",
              senderType: "agent",
              plainText: edited ? "Edited acceptance" : "Full acceptance",
              deliveryStatus: "read",
              editedAt: edited ? new Date().toISOString() : null,
              deletedAt: deleted ? new Date().toISOString() : null,
              reactions: reacted ? [{ emoji: "✅" }] : [],
            },
          ],
        });
      }
      return response({ error: "not_found" }, 404);
    };

    const config = acceptanceConfig({
      KEENAI_API_URL: "http://keenai.test",
      KEENAI_ACCESS_TOKEN: "secret-token",
      KEENAI_ACCEPTANCE_CHANNELS: "feishu",
      KEENAI_ACCEPTANCE_MODE: "full",
      KEENAI_ACCEPTANCE_PROBES_JSON: JSON.stringify({
        feishu: {
          conversationId: "conversation-1",
          inboundToken: "probe-feishu-full",
          outboundAckToken: "ack-feishu-full",
          outboundText: "Full acceptance",
          editedText: "Edited acceptance",
          reactionEmoji: "✅",
          inboundAttachmentFileName: "provider-inbound.txt",
          attachmentPath: "/tmp/acceptance.txt",
          attachmentContentType: "text/plain",
          interactivePromptToken: "Choose acceptance action",
          interactiveButtonId: "accept",
          interactiveCompletionToken: "Acceptance branch completed",
        },
      }),
      KEENAI_ACCEPTANCE_POLL_INTERVAL_MS: "1",
      KEENAI_ACCEPTANCE_TIMEOUT_MS: "1000",
    });
    const report = await runChannelProviderAcceptance(config, {
      fetchImpl,
      sleep: async () => undefined,
      readFileImpl: async () => new Uint8Array([1, 2, 3]),
    });

    expect(report.passed).toBe(true);
    expect(outboundBodies[0]).toMatchObject({
      attachmentIds: ["attachment-1"],
      inReplyTo: "inbound-1",
    });
    expect(report.channels[0]?.roundtrip?.features).toEqual(
      expect.arrayContaining([
        { feature: "attachments", passed: true },
        { feature: "threads", passed: true },
        { feature: "interactive", passed: true },
        { feature: "templates", passed: true, skipped: true, reason: "not_declared" },
        { feature: "delivery_receipts", passed: true },
        { feature: "read_receipts", passed: true },
        { feature: "message_edit", passed: true },
        { feature: "reactions", passed: true },
        { feature: "message_delete", passed: true },
        { feature: "typing", passed: true, skipped: true, reason: "not_declared" },
      ]),
    );
  });

  it("sends a real WhatsApp template probe when templates are declared", async () => {
    const outboundBodies: Record<string, unknown>[] = [];
    const response = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/me")) return response({ brandIds: ["brand-1"] });
      if (path.endsWith("/channel-connections")) {
        return response({
          items: [
            {
              id: "whatsapp-1",
              channelType: "whatsapp",
              status: "active",
              name: "Production WhatsApp",
              transport: "webhook",
            },
          ],
        });
      }
      if (path.endsWith("/channel-connections/whatsapp-1/test")) {
        return response({ result: { ok: true, verification: "provider" } });
      }
      if (path.endsWith("/conversations/conversation-wa")) {
        return response({
          conversation: {
            id: "conversation-wa",
            channelType: "whatsapp",
            channelCapabilities: ["templates"],
          },
        });
      }
      if (path.endsWith("/conversations/conversation-wa/messages")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          outboundBodies.push(body);
          const id = body.directives ? "template-1" : "outbound-1";
          return response({ message: { id, deliveryStatus: "pending" } }, 201);
        }
        return response({
          items: [
            {
              id: "inbound-1",
              senderType: "user",
              plainText: "probe-whatsapp-full",
              createdAt: new Date().toISOString(),
              deletedAt: null,
            },
            {
              id: "outbound-ack-1",
              senderType: "user",
              plainText: "ack-whatsapp-full",
              createdAt: new Date().toISOString(),
              deletedAt: null,
            },
            { id: "outbound-1", senderType: "agent", deliveryStatus: "sent" },
            { id: "template-1", senderType: "agent", deliveryStatus: "sent" },
          ],
        });
      }
      return response({ error: "not_found" }, 404);
    };

    const config = acceptanceConfig({
      KEENAI_API_URL: "http://keenai.test",
      KEENAI_ACCESS_TOKEN: "secret-token",
      KEENAI_ACCEPTANCE_CHANNELS: "whatsapp",
      KEENAI_ACCEPTANCE_MODE: "full",
      KEENAI_ACCEPTANCE_PROBES_JSON: JSON.stringify({
        whatsapp: {
          conversationId: "conversation-wa",
          inboundToken: "probe-whatsapp-full",
          outboundAckToken: "ack-whatsapp-full",
          outboundText: "Full acceptance",
          templateName: "support_follow_up",
          templateLanguageCode: "en_US",
          templateComponents: [{ type: "body", parameters: [] }],
        },
      }),
      KEENAI_ACCEPTANCE_POLL_INTERVAL_MS: "1",
      KEENAI_ACCEPTANCE_TIMEOUT_MS: "1000",
    });
    const report = await runChannelProviderAcceptance(config, {
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(report.passed, JSON.stringify(report)).toBe(true);
    expect(outboundBodies[1]).toEqual({
      directives: {
        whatsappTemplate: {
          name: "support_follow_up",
          languageCode: "en_US",
          components: [{ type: "body", parameters: [] }],
        },
      },
    });
    expect(report.channels[0]?.roundtrip?.features).toContainEqual({
      feature: "templates",
      passed: true,
    });
  });

  it("does not accept configuration-only verification unless explicitly allowed", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/me")) {
        return new Response(JSON.stringify({ brandIds: ["brand-1"] }));
      }
      if (pathname.endsWith("/channel-connections")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "dingtalk-1",
                channelType: "dingtalk",
                status: "active",
                name: "DingTalk",
                transport: "webhook",
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ result: { verification: "configuration_only" } }));
    };
    const config = acceptanceConfig({
      KEENAI_API_URL: "http://keenai.test",
      KEENAI_ACCESS_TOKEN: "secret-token",
      KEENAI_ACCEPTANCE_CHANNELS: "dingtalk",
    });

    const report = await runChannelProviderAcceptance(config, { fetchImpl });

    expect(report.passed).toBe(false);
    expect(report.channels[0]?.connections[0]).toMatchObject({
      passed: false,
      error: "unexpected_verification:configuration_only",
    });
  });
});
