import { describe, expect, it, vi } from "vitest";
import {
  type TelegramWebhookFetch,
  buildTelegramWebhookUrl,
  reconcileTelegramTransport,
} from "./telegram-webhook.js";

describe("Telegram webhook lifecycle", () => {
  it("builds a tenant- and connection-specific HTTPS callback URL", () => {
    expect(
      buildTelegramWebhookUrl({
        baseUrl: "https://api.example.com/base",
        orgSlug: "acme",
        brandSlug: "support",
        connectionId: "connection-1",
      }),
    ).toBe(
      "https://api.example.com/api/v1/webhooks/im/telegram?org=acme&brand=support&connection=connection-1",
    );
    expect(() =>
      buildTelegramWebhookUrl({
        baseUrl: "http://api.example.com",
        orgSlug: "acme",
        brandSlug: "support",
        connectionId: "connection-1",
      }),
    ).toThrow("telegram_webhook_url_https_required");
  });

  it("registers and verifies webhook mode", async () => {
    const webhookUrl =
      "https://api.example.com/api/v1/webhooks/im/telegram?org=acme&brand=default&connection=c1";
    const fetchFn = vi
      .fn<TelegramWebhookFetch>()
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok({ url: webhookUrl, pending_update_count: 3 }));

    await expect(
      reconcileTelegramTransport({
        botToken: "bot-token",
        transport: "webhook",
        webhookUrl,
        webhookSecret: "valid_secret-1",
        fetchFn,
      }),
    ).resolves.toEqual({
      providerAction: "setWebhook",
      webhookUrl,
      pendingUpdateCount: 3,
    });
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("/setWebhook");
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      url: webhookUrl,
      secret_token: "valid_secret-1",
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "business_message",
        "edited_business_message",
        "deleted_business_messages",
        "message_reaction",
        "callback_query",
      ],
      drop_pending_updates: false,
    });
  });

  it("removes and verifies webhook state before polling", async () => {
    const fetchFn = vi
      .fn<TelegramWebhookFetch>()
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok({ url: "", pending_update_count: 0 }));

    await expect(
      reconcileTelegramTransport({ botToken: "bot-token", transport: "polling", fetchFn }),
    ).resolves.toEqual({
      providerAction: "deleteWebhook",
      webhookUrl: null,
      pendingUpdateCount: 0,
    });
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("/deleteWebhook");
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain("/getWebhookInfo");
  });

  it("rejects unsafe webhook configuration and mismatched provider state", async () => {
    await expect(
      reconcileTelegramTransport({
        botToken: "bot-token",
        transport: "webhook",
        webhookUrl: "https://api.example.com/hook",
        webhookSecret: "contains spaces",
        fetchFn: vi.fn<TelegramWebhookFetch>(),
      }),
    ).rejects.toThrow("telegram_webhook_secret_invalid");

    const fetchFn = vi
      .fn<TelegramWebhookFetch>()
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok({ url: "https://wrong.example.com/hook" }));
    await expect(
      reconcileTelegramTransport({
        botToken: "bot-token",
        transport: "webhook",
        webhookUrl: "https://api.example.com/hook",
        webhookSecret: "valid-secret",
        fetchFn,
      }),
    ).rejects.toThrow("telegram_webhook_url_mismatch");
  });
});

function ok(result: unknown): Response {
  return Response.json({ ok: true, result });
}
