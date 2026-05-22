import { describe, expect, it } from "vitest";
import { buildDraftStreamInput, draftRequestHasImages } from "./prompts.js";
import type { DraftRequest } from "./types.js";

describe("buildDraftStreamInput", () => {
  it("uses prompt mode for text-only drafts", () => {
    const req: DraftRequest = {
      messages: [{ role: "user", plainText: "Hello" }],
      subject: "Support",
    };
    const input = buildDraftStreamInput(req);
    expect(input.mode).toBe("prompt");
    if (input.mode === "prompt") {
      expect(input.prompt).toContain("Hello");
      expect(input.system).toContain("customer support");
    }
    expect(draftRequestHasImages(req)).toBe(false);
  });

  it("uses messages mode when images are present", () => {
    const req: DraftRequest = {
      messages: [
        {
          role: "user",
          plainText: "See screenshot",
          images: [{ mimeType: "image/png", dataBase64: "aGVsbG8=" }],
        },
      ],
    };
    const input = buildDraftStreamInput(req);
    expect(input.mode).toBe("messages");
    if (input.mode === "messages") {
      expect(input.messages).toHaveLength(1);
      expect(input.messages[0]?.content.some((p) => p.type === "image")).toBe(true);
    }
    expect(draftRequestHasImages(req)).toBe(true);
  });
});
