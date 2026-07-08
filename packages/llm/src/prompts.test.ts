import { describe, expect, it } from "vitest";
import { buildDraftStreamInput, draftRequestHasImages } from "./prompts.js";
import type { DraftRequest } from "./types.js";

describe("buildDraftStreamInput", () => {
  it("uses prompt mode for text-only drafts", () => {
    const req: DraftRequest = {
      messages: [{ role: "user", plainText: "Hello" }],
      subject: "Support",
      memoryContext: "[Memory Tree · scope=conversation]\n## Buffer\n- billing issue",
    };
    const input = buildDraftStreamInput(req);
    expect(input.mode).toBe("prompt");
    if (input.mode === "prompt") {
      expect(input.prompt).toContain("Hello");
      expect(input.system).toContain("customer support");
      expect(input.system).toContain("billing issue");
    }
    expect(draftRequestHasImages(req)).toBe(false);
  });

  it("adds Simplified Chinese guidance for Chinese conversations", () => {
    const input = buildDraftStreamInput({
      messages: [{ role: "user", plainText: "我的订单无法退款，帮我看一下" }],
    });
    expect(input.mode).toBe("prompt");
    if (input.mode === "prompt") {
      expect(input.system).toContain("Simplified Chinese");
      expect(input.system).toContain("natural Chinese customer-support tone");
    }
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
