export {
  type BrandPersonality as KeeniPersonality,
  DEFAULT_BRAND_PERSONALITY as DEFAULT_KEENI_PERSONALITY,
  brandPersonalitySchema as keenPersonalitySchema,
  buildAgentSystemPrompt,
  parseBrandPersonality,
} from "@keenai/shared";

import {
  type BrandPersonality,
  DEFAULT_BRAND_PERSONALITY,
  parseBrandPersonality,
} from "@keenai/shared";

export function buildPersonality(overrides: Partial<BrandPersonality> = {}): BrandPersonality {
  return parseBrandPersonality({ ...DEFAULT_BRAND_PERSONALITY, ...overrides });
}
