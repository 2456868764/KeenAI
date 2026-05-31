import { describe, expect, it } from "vitest";
import { buildKeeniAgentContext } from "../src/orchestrator.js";
import { buildPersonality } from "../src/personality.js";

describe("buildKeeniAgentContext", () => {
  it("merges personality system prompt into draft instruction", () => {
    const personality = buildPersonality({ name: "Acme Bot" });
    const ctx = buildKeeniAgentContext({
      params: {
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      personality,
      draftRequest: {
        messages: [{ role: "user", plainText: "Hello" }],
        instruction: "Keep it short.",
      },
    });

    expect(ctx.personality.name).toBe("Acme Bot");
    expect(ctx.draftRequest.instruction).toContain("Keep it short.");
    expect(ctx.draftRequest.instruction).toContain("Guardrails:");
    expect(ctx.maxIterations).toBe(10);
  });
});
