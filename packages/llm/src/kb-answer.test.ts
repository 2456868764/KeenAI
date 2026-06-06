import { describe, expect, it } from "vitest";
import { buildKbAnswerPrompt } from "./kb-answer.js";

describe("buildKbAnswerPrompt", () => {
  it("includes article context and question", () => {
    const { system, prompt } = buildKbAnswerPrompt({
      query: "How do I reset my password?",
      chunks: [
        {
          chunkId: "c1",
          documentTitle: "Reset password",
          content: "Go to Settings → Security → Reset password.",
          contextPrefix: "Account",
        },
      ],
    });

    expect(system).toContain("help center assistant");
    expect(prompt).toContain("Reset password");
    expect(prompt).toContain("How do I reset my password?");
  });
});
