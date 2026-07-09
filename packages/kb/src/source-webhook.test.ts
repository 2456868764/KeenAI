import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KbSourceWebhookError, handleKbSourceWebhook } from "./source-webhook.js";

function githubSignature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("handleKbSourceWebhook", () => {
  it("verifies GitHub HMAC and normalizes changed resources", () => {
    const rawBody = JSON.stringify({
      commits: [
        {
          timestamp: "2026-07-09T00:00:00.000Z",
          added: ["docs/new.md"],
          modified: ["README.md"],
        },
      ],
    });

    const result = handleKbSourceWebhook({
      provider: "github",
      rawBody,
      config: { webhookSecret: "github-secret" },
      headers: {
        "x-github-event": "push",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": githubSignature(rawBody, "github-secret"),
      },
    });

    expect(result).toEqual({
      provider: "github",
      action: "ingest",
      eventType: "push",
      eventId: "delivery-1",
      refs: [
        { externalId: "docs/new.md", updatedAt: "2026-07-09T00:00:00.000Z" },
        { externalId: "README.md", updatedAt: "2026-07-09T00:00:00.000Z" },
      ],
    });
  });

  it("rejects invalid GitHub signatures", () => {
    const rawBody = JSON.stringify({ zen: "Keep it logically awesome." });

    expect(() =>
      handleKbSourceWebhook({
        provider: "github",
        rawBody,
        config: { webhookSecret: "github-secret" },
        headers: {
          "x-github-event": "ping",
          "x-hub-signature-256": githubSignature(rawBody, "wrong-secret"),
        },
      }),
    ).toThrow(KbSourceWebhookError);
  });

  it("verifies Notion webhook tokens and extracts page refs", () => {
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "page.updated",
      entity: { id: "page-123" },
      updated_at: "2026-07-09T01:00:00.000Z",
    });

    const result = handleKbSourceWebhook({
      provider: "notion",
      rawBody,
      config: { webhookToken: "notion-secret" },
      headers: {
        "x-notion-webhook-token": "notion-secret",
      },
    });

    expect(result).toEqual({
      provider: "notion",
      action: "ingest",
      eventType: "page.updated",
      eventId: "evt_1",
      refs: [{ externalId: "page-123", updatedAt: "2026-07-09T01:00:00.000Z" }],
    });
  });
});
