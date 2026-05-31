import { describe, expect, it } from "vitest";
import {
  KEENI_AGENT_MASTRA_ADAPTER,
  buildKeeniMastraAgent,
  buildMastraStreamMessages,
  describeMastraAgentIdentity,
} from "../src/mastra-agent.js";
import { buildKeeniAgentContext } from "../src/orchestrator.js";

describe("Mastra agent integration", () => {
  it("enables the Mastra adapter", () => {
    expect(KEENI_AGENT_MASTRA_ADAPTER.enabled).toBe(true);
    expect(KEENI_AGENT_MASTRA_ADAPTER.targetPackage).toBe("@mastra/core/agent");
  });

  it("describes a brand-scoped Mastra agent identity", () => {
    const identity = describeMastraAgentIdentity({
      brandId: "brand-1",
      name: "Keeni",
      instructions: "Help customers.",
    });
    expect(identity.id).toBe("keeni-brand-1");
    expect(identity.instructions).toBe("Help customers.");
  });

  it("builds a Mastra Agent from Keeni context", () => {
    const ctx = buildKeeniAgentContext({
      params: {
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      draftRequest: {
        messages: [{ role: "user", plainText: "Need help" }],
        instruction: "Keep it short.",
      },
    });

    const agent = buildKeeniMastraAgent({ context: ctx, model: {} as never });
    expect(agent.id).toBe("keeni-brand-1");
    expect(agent.name).toBe("Keeni");
  });

  it("builds stream messages from draft transcript", () => {
    const prompt = buildMastraStreamMessages({
      messages: [{ role: "user", plainText: "Where is my order?" }],
      subject: "Shipping",
    });
    expect(prompt).toContain("Shipping");
    expect(prompt).toContain("Where is my order?");
    expect(prompt).toContain("Draft the next agent reply:");
  });
});
