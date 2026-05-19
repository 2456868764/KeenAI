import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("creates json logger without pretty transport", () => {
    const env = parseApiEnv({
      NODE_ENV: "production",
      DATABASE_URL: ":memory:",
      LOG_FORMAT: "json",
    });
    const log = createLogger(env);
    expect(log.level).toBe(env.LOG_LEVEL);
  });
});
