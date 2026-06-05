import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { initOtel, initSentry } from "./otel.js";

describe("observability (P0-09/11)", () => {
  it("skips OTel when disabled", async () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const log = createLogger(env);
    await expect(initOtel(env, log)).resolves.toBeUndefined();
  });

  it("skips OTel in test even when enabled", async () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      OTEL_ENABLED: "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
    });
    const log = createLogger(env);
    await initOtel(env, log);
  });

  it("skips Sentry in test", () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      SENTRY_DSN: "https://example@o0.ingest.sentry.io/0",
    });
    const log = createLogger(env);
    expect(() => initSentry(env, log)).not.toThrow();
  });
});
