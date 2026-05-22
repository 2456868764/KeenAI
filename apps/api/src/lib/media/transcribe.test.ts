import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { transcribeAudio } from "./transcribe.js";

describe("transcribeAudio", () => {
  it("returns stub transcript when no OpenAI key", async () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      STT_PROVIDER: "stub",
    });
    const result = await transcribeAudio(env, {
      data: new Uint8Array([1, 2, 3, 4]),
      contentType: "audio/webm",
      fileName: "note.webm",
    });
    expect(result.provider).toBe("stub");
    expect(result.transcript).toContain("note.webm");
  });
});
