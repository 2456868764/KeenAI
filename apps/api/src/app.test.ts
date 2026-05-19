import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

describe("API health", () => {
  it("GET /health returns ok", async () => {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    const app = createApp({
      store,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");

    await store.close();
  });
});
