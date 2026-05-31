import { describe, expect, it } from "vitest";
import { proposalToDraftSkill, proposeSkillFromRun } from "../src/skill/discoverer.js";
import { createInMemorySkillRegistry, matchSkillsFromRegistry } from "../src/skill/match.js";
import { runSkill } from "../src/skill/runner.js";
import { DEFAULT_REFUND_SKILL } from "../src/skill/types.js";

describe("skill system stub", () => {
  it("matches refund intent from customer message", () => {
    const registry = createInMemorySkillRegistry([DEFAULT_REFUND_SKILL]);
    const matches = matchSkillsFromRegistry(registry, {
      orgId: "org-demo",
      brandId: "brand-demo",
      message: "Please refund order 42",
    });
    expect(matches[0]?.skill.name).toBe("refund-handler");
    expect(matches[0]?.matchedIntent).toBe("refund_request");
  });

  it("runs branch steps and escalates when ineligible", async () => {
    const result = await runSkill({
      skill: DEFAULT_REFUND_SKILL,
      context: { conversationId: "conv-1", variables: {} },
      executeTool: async (tool, _inputs, context) => {
        if (tool === "check_eligibility") {
          context.variables.eligibility = { ok: false };
          return { ok: false };
        }
        return { ok: true };
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.escalatedReason).toBe("not_eligible");
    expect(result.stepsExecuted).toBeGreaterThan(0);
  });

  it("proposes a draft skill after a resolved refund conversation", () => {
    const proposal = proposeSkillFromRun({
      orgId: "org-demo",
      brandId: "brand-demo",
      conversationId: "conv-1",
      customerMessage: "Can I get a refund?",
      replyText: "Your refund has been processed.",
      resolution: { type: "confirmed", confidence: 0.8, evidence: "thanks" },
    });

    expect(proposal?.name).toBe("refund-handler");
    if (!proposal) throw new Error("expected skill proposal");
    const draft = proposalToDraftSkill(proposal, { orgId: "org-demo", brandId: "brand-demo" });
    expect(draft.status).toBe("draft");
    expect(draft.source).toBe("auto_discovered");
  });
});
