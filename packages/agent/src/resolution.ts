import { z } from "zod";
import type { KeeniAgentTrigger } from "./types.js";

export const KEENI_RESOLUTION_TYPES = ["confirmed", "assumed", "unresolved", "escalated"] as const;

export type KeeniResolutionType = (typeof KEENI_RESOLUTION_TYPES)[number];

export const keenResolutionSchema = z.object({
  type: z.enum(KEENI_RESOLUTION_TYPES),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export type KeeniResolution = z.infer<typeof keenResolutionSchema>;

export type DetectResolutionInput = {
  replyText: string;
  customerMessage?: string;
  trigger?: KeeniAgentTrigger;
  hadError?: boolean;
};

const ESCALATION_PATTERN =
  /\b(human agent|speak to (a )?(person|manager|supervisor)|escalat(e|ed|ing)|transfer (me )?to)\b/i;
const CONFIRMED_PATTERN =
  /\b(thanks?|thank you|perfect|great|that helps|all set|resolved|issue fixed)\b/i;
const RESOLVED_REPLY_PATTERN =
  /\b(issue (is )?resolved|taken care of|should be all set|glad (i could|to) help)\b/i;

/** Heuristic resolution classifier — LLM `generateObject` lands in a later sprint. */
export function detectResolution(input: DetectResolutionInput): KeeniResolution {
  if (input.hadError) {
    return {
      type: "unresolved",
      confidence: 0.9,
      evidence: "Agent run failed",
    };
  }

  const reply = input.replyText.trim();
  const customer = input.customerMessage?.trim() ?? "";

  if (ESCALATION_PATTERN.test(`${reply} ${customer}`)) {
    return {
      type: "escalated",
      confidence: 0.85,
      evidence: "Escalation language detected",
    };
  }

  if (customer && CONFIRMED_PATTERN.test(customer)) {
    return {
      type: "confirmed",
      confidence: 0.8,
      evidence: "Positive customer feedback",
    };
  }

  if (RESOLVED_REPLY_PATTERN.test(reply)) {
    return {
      type: "assumed",
      confidence: 0.65,
      evidence: "Agent marked issue as resolved",
    };
  }

  return {
    type: "unresolved",
    confidence: 0.5,
    evidence: "No resolution signals",
  };
}
