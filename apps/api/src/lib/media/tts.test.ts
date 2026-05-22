import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { synthesizeSpeech } from "./tts.js";

describe("synthesizeSpeech", () => {
  it("returns stub WAV when no OpenAI key", async () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      TTS_PROVIDER: "stub",
    });
    const result = await synthesizeSpeech(env, { text: "Hello from KeenAI." });
    expect(result.provider).toBe("stub");
    expect(result.contentType).toBe("audio/wav");
    expect(result.data.byteLength).toBeGreaterThan(44);
  });
});
