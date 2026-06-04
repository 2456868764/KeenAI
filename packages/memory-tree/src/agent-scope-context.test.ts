import { describe, expect, it } from "vitest";
import { buildAgentScopeContextPlan } from "./agent-scope-context.js";

describe("agent-scope-context MT-06 stub", () => {
  it("maps instruction intents to loader plans", () => {
    expect(buildAgentScopeContextPlan({}).loaders).toEqual(["conversation_tree", "l3_facts"]);
    expect(buildAgentScopeContextPlan({ instruction: "产品怎么用" }).scope).toBe("kb_only");
    expect(buildAgentScopeContextPlan({ instruction: "产品怎么用" }).loaders).toEqual([
      "kb_search",
    ]);
    expect(
      buildAgentScopeContextPlan({ instruction: "这个客户之前买过什么", userId: "u1" }).loaders,
    ).toEqual(["customer_tree", "l3_facts"]);
    const daily = buildAgentScopeContextPlan({ instruction: "今天 support 概况" });
    expect(daily.scope).toBe("brand_daily");
    expect(daily.loaders).toEqual(["brand_daily_digest"]);
    expect(daily.dateUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      buildAgentScopeContextPlan({ instruction: "结合对话和今天概况", userId: "u1" }).loaders,
    ).toEqual(["conversation_tree", "brand_daily_digest", "l3_facts"]);
  });
});
