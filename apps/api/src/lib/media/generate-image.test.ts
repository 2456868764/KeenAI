import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { generateImage } from "./generate-image.js";

describe("generateImage", () => {
  it("returns stub PNG when no OpenAI key", async () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      IMAGE_GEN_PROVIDER: "stub",
    });
    const result = await generateImage(env, { prompt: "A blue diagram of a network." });
    expect(result.provider).toBe("stub");
    expect(result.contentType).toBe("image/png");
    expect(result.data.byteLength).toBeGreaterThan(0);
  });
});
