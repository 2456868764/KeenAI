import { type KeeniSkill, type KeeniSkillMatch, keenSkillSchema } from "./types.js";

export type SkillRegistry = {
  list(orgId: string, brandId?: string | null): KeeniSkill[];
  get(id: string): KeeniSkill | undefined;
  upsert(skill: KeeniSkill): KeeniSkill;
};

export function createInMemorySkillRegistry(seed: KeeniSkill[] = []): SkillRegistry {
  const skills = new Map<string, KeeniSkill>(
    seed.map((skill) => [skill.id, keenSkillSchema.parse(skill)]),
  );

  return {
    list(orgId, brandId) {
      return [...skills.values()].filter((skill) => {
        if (skill.orgId !== orgId) return false;
        if (brandId && skill.brandId && skill.brandId !== brandId) return false;
        return skill.status === "active";
      });
    },
    get(id) {
      return skills.get(id);
    },
    upsert(skill) {
      const parsed = keenSkillSchema.parse(skill);
      skills.set(parsed.id, parsed);
      return parsed;
    },
  };
}

export type MatchSkillsInput = {
  message: string;
  skills: KeeniSkill[];
};

const INTENT_KEYWORDS: Record<string, RegExp> = {
  refund_request: /\b(refund|money back|chargeback|return)\b/i,
  shipping_status: /\b(where is my order|tracking|shipment|delivery)\b/i,
  password_reset: /\b(reset password|forgot password|locked out)\b/i,
};

/** Heuristic skill trigger matcher — embedding/LLM routing lands in a later sprint. */
export function matchSkills(input: MatchSkillsInput): KeeniSkillMatch[] {
  const text = input.message.trim();
  if (!text) return [];

  return input.skills
    .map((skill) => {
      const pattern =
        INTENT_KEYWORDS[skill.trigger.intent] ?? new RegExp(skill.trigger.intent, "i");
      const matched = pattern.test(text);
      if (!matched) return null;

      const score = Math.min(1, skill.trigger.confidence + 0.15);
      return {
        skill,
        score,
        matchedIntent: skill.trigger.intent,
      } satisfies KeeniSkillMatch;
    })
    .filter((match): match is KeeniSkillMatch => match !== null)
    .sort((a, b) => b.score - a.score);
}

export function matchSkillsFromRegistry(
  registry: SkillRegistry,
  input: { orgId: string; brandId?: string | null; message: string },
): KeeniSkillMatch[] {
  return matchSkills({
    message: input.message,
    skills: registry.list(input.orgId, input.brandId),
  });
}
