import { describe, expect, it } from "vitest";
import { KEENI_AGENT_MASTRA_ADAPTER, describeMastraAgentStub } from "../src/mastra-stub.js";

describe("Mastra adapter stub", () => {
  it("documents that Mastra is not wired yet", () => {
    expect(KEENI_AGENT_MASTRA_ADAPTER.enabled).toBe(false);
    expect(KEENI_AGENT_MASTRA_ADAPTER.targetPackage).toBe("@mastra/core/agent");
  });

  it("describes a future Mastra agent identity", () => {
    const stub = describeMastraAgentStub({
      brandId: "brand-1",
      name: "Keeni",
      instructions: "Help customers.",
    });
    expect(stub.id).toBe("keeni-brand-1");
    expect(stub.instructions).toBe("Help customers.");
  });
});
