import { describe, expect, it } from "vitest";
import {
  CONTEXT_WEIGHTS_BY_INTENT,
  classifyQueryIntent,
  rerankUnifiedContextSections,
} from "../src/context/assembler.js";

describe("KB-22 unified context assembler", () => {
  it("classifies intent and exposes routing weights", () => {
    expect(classifyQueryIntent("我的订单状态")).toBe("personal");
    expect(classifyQueryIntent("export billing error failed")).toBe("troubleshooting");
    expect(classifyQueryIntent("how to reset password step by step")).toBe("procedural");
    expect(classifyQueryIntent("product pricing policy")).toBe("factual");
    expect(CONTEXT_WEIGHTS_BY_INTENT.factual.kb).toBeGreaterThan(
      CONTEXT_WEIGHTS_BY_INTENT.personal.kb,
    );
  });

  it("reranks KB sections above memory for factual queries", () => {
    const ranked = rerankUnifiedContextSections(
      [
        {
          title: "Customer memory",
          body: "Customer prefers email follow-up.",
          source: "memory",
        },
        {
          title: "Knowledge Base: Refund policy",
          body: "Customers can request a refund within 30 days.",
          source: "kb",
          score: 0.4,
        },
      ],
      {
        intent: "factual",
        weights: CONTEXT_WEIGHTS_BY_INTENT.factual,
        query: "refund policy",
      },
    );

    expect(ranked[0]?.source).toBe("kb");
    expect(ranked[0]?.reason).toContain("intent:factual");
  });

  it("reranks memory sections above KB for personal queries", () => {
    const ranked = rerankUnifiedContextSections(
      [
        {
          title: "Knowledge Base: Shipping",
          body: "Shipping policy applies to all customers.",
          source: "kb",
          score: 0.8,
        },
        {
          title: "Customer topic buffer (L0)",
          body: "My order was delayed and I prefer refunds to credits.",
          source: "memory",
        },
      ],
      {
        intent: "personal",
        weights: CONTEXT_WEIGHTS_BY_INTENT.personal,
        query: "my order refund preference",
      },
    );

    expect(ranked[0]?.source).toBe("memory");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });
});
