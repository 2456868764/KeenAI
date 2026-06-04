import { describe, expect, it } from "vitest";
import { CONTEXT_WEIGHTS_BY_INTENT, classifyQueryIntent } from "../src/context/assembler.js";

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
});
