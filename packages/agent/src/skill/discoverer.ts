import type { KeeniResolution } from "../resolution.js";
import type { KeeniSkill } from "./types.js";
import { keenSkillSchema } from "./types.js";

export type KeeniSkillProposal = {
  name: string;
  description: string;
  triggerIntent: string;
  source: "auto_discovered";
};

export type ProposeSkillFromRunInput = {
  orgId: string;
  brandId?: string | null;
  conversationId: string;
  replyText: string;
  customerMessage?: string;
  resolution: KeeniResolution;
};

const DISCOVERY_PATTERNS: Array<{
  intent: string;
  pattern: RegExp;
  name: string;
  description: string;
}> = [
  {
    intent: "refund_request",
    pattern: /\b(refund|money back)\b/i,
    name: "refund-handler",
    description: "Handle refund requests with eligibility checks",
  },
  {
    intent: "shipping_status",
    pattern: /\b(where is my order|tracking)\b/i,
    name: "shipping-tracker",
    description: "Look up order shipment status",
  },
];

/** Stub discoverer — returns a draft proposal when patterns repeat in resolved runs. */
export function proposeSkillFromRun(input: ProposeSkillFromRunInput): KeeniSkillProposal | null {
  if (input.resolution.type !== "confirmed" && input.resolution.type !== "assumed") {
    return null;
  }

  const text = `${input.customerMessage ?? ""} ${input.replyText}`.trim();
  if (!text) return null;

  for (const candidate of DISCOVERY_PATTERNS) {
    if (!candidate.pattern.test(text)) continue;
    return {
      name: candidate.name,
      description: candidate.description,
      triggerIntent: candidate.intent,
      source: "auto_discovered",
    };
  }

  return null;
}

export function proposalToDraftSkill(
  proposal: KeeniSkillProposal,
  input: { orgId: string; brandId?: string | null; id?: string },
): KeeniSkill {
  return keenSkillSchema.parse({
    id: input.id ?? `skill-${proposal.name}`,
    orgId: input.orgId,
    brandId: input.brandId ?? null,
    name: proposal.name,
    description: proposal.description,
    trigger: { intent: proposal.triggerIntent, confidence: 0.7 },
    status: "draft",
    source: proposal.source,
    version: 1,
    steps: [
      { kind: "tool", tool: "search_knowledge_base", inputs: { query: proposal.triggerIntent } },
    ],
  });
}
