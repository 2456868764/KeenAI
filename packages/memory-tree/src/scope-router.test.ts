import { describe, expect, it } from "vitest";
import { resolveMemoryScope } from "./scope-router.js";

describe("memory-tree scope router", () => {
  it("routes common agent intents to memory scopes", () => {
    expect(resolveMemoryScope({ instruction: undefined }).scope).toBe("conversation");
    expect(resolveMemoryScope({ instruction: "今天 support 概况" }).scope).toBe("brand_daily");
    expect(resolveMemoryScope({ instruction: "这个客户之前买过什么？" }).scope).toBe("customer");
    expect(resolveMemoryScope({ instruction: "产品怎么用？" }).scope).toBe("kb_only");
  });
});
