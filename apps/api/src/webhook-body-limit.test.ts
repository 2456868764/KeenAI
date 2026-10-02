import { parseApiEnv } from "@keenai/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { emailWebhookRoutes } from "./routes/email-webhooks.js";
import { imWebhookRoutes } from "./routes/im-webhooks.js";
import type { AppVariables } from "./types.js";

function webhookRouteApp() {
  const env = parseApiEnv({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    WEBHOOK_IM_SECRET: "test-im-webhook-secret",
    WEBHOOK_EMAIL_SECRET: "test-email-webhook-secret",
  });
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.route("/", imWebhookRoutes());
  app.route("/", emailWebhookRoutes());
  return app;
}

describe("channel webhook body limits", () => {
  it("rejects oversized IM payloads before parsing or tenant resolution", async () => {
    const app = new Hono().route("/", imWebhookRoutes());
    const response = await app.request("/api/v1/webhooks/im/telegram", {
      method: "POST",
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
      body: "{}",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "payload_too_large",
    });
  });

  it("rejects oversized Email payloads before MIME or form parsing", async () => {
    const app = new Hono().route("/", emailWebhookRoutes());
    const response = await app.request("/api/v1/webhooks/email/inbound", {
      method: "POST",
      headers: { "content-length": String(30 * 1024 * 1024 + 1) },
      body: "mail",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "payload_too_large",
    });
  });
});

describe("native provider webhook authentication boundary", () => {
  it.each([
    ["IM", "/api/v1/webhooks/im/telegram"],
    ["Email", "/api/v1/webhooks/email/inbound"],
  ])("does not require a KeenAI-only header from %s providers", async (_name, url) => {
    const app = webhookRouteApp();

    const response = await app.request(url, { method: "POST", body: "{}" });

    // Native providers cannot add a deployment-specific KeenAI header. Their
    // official signature or connection auth is enforced after tenant routing.
    expect(response.status).toBe(400);
  });
});
