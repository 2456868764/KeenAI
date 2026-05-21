import { describe, expect, it } from "vitest";
import { stubDraftProvider } from "./stub.js";

describe("stubDraftProvider", () => {
  it("streams a draft reply", async () => {
    const chunks: string[] = [];
    for await (const chunk of stubDraftProvider.streamDraft({
      messages: [{ role: "user", plainText: "I need a refund for order 99" }],
      instruction: "be polite",
    })) {
      if (chunk.type === "text-delta") chunks.push(chunk.text);
    }
    const full = chunks.join("");
    expect(full).toContain("refund");
    expect(full).toContain("Support Team");
  });
});
