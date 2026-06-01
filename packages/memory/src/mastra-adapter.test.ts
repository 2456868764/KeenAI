import { Memory } from "@mastra/memory";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS,
  KEENI_MEMORY_MASTRA_ADAPTER,
  KEENI_USER_PROFILE_TEMPLATE,
  buildKeeniMastraMemory,
  buildMastraResourceId,
  toResourceId,
} from "./mastra-adapter.js";

describe("Mastra memory adapter", () => {
  it("enables the Mastra adapter", () => {
    expect(KEENI_MEMORY_MASTRA_ADAPTER.enabled).toBe(true);
    expect(KEENI_MEMORY_MASTRA_ADAPTER.targetPackage).toBe("@mastra/memory");
  });

  it("builds Mastra resource ids from scope", () => {
    const scope = {
      orgId: "org_001",
      brandId: "brand_main",
      subject: "customer" as const,
      subjectId: "cust_yyy",
    };
    expect(toResourceId(scope)).toBe("org_001:brand_main:customer:cust_yyy");
    expect(buildMastraResourceId(scope)).toBe("org_001:brand_main:customer:cust_yyy");
  });

  it("includes the KeenAI working-memory profile template", () => {
    expect(KEENI_USER_PROFILE_TEMPLATE).toContain("# Customer Profile");
    expect(DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.workingMemory.template).toBe(
      KEENI_USER_PROFILE_TEMPLATE,
    );
    expect(DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.semanticRecall.scope).toBe("resource");
  });

  it("builds a Mastra Memory instance for a brand", () => {
    const memory = buildKeeniMastraMemory({
      orgId: "org-1",
      brandId: "brand-1",
    });
    expect(memory).toBeInstanceOf(Memory);
  });
});
