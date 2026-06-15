import { z } from "zod";

export const brandPersonalitySchema = z.object({
  name: z.string().min(1).max(64),
  voice: z.object({
    tone: z.enum(["friendly_professional", "casual", "formal"]).default("friendly_professional"),
    formality: z.number().min(0).max(1).default(0.5),
    emojiUsage: z.enum(["none", "minimal", "rich"]).default("minimal"),
    responseLength: z.enum(["concise", "balanced", "detailed"]).default("balanced"),
  }),
  language: z.object({
    primary: z.string().min(2).max(16).default("en"),
    fallback: z.string().min(2).max(16).default("en"),
    autoDetect: z.boolean().default(true),
  }),
  systemPrompt: z.string().min(1).max(8000),
  guardRails: z.array(z.string().max(500)).max(20).default([]),
  sensitiveTopics: z.array(z.string().max(120)).max(20).default([]),
  capabilities: z.array(z.string().max(120)).max(20).default([]),
});

export type BrandPersonality = z.infer<typeof brandPersonalitySchema>;

export const DEFAULT_BRAND_PERSONALITY: BrandPersonality = {
  name: "Keeni",
  voice: {
    tone: "friendly_professional",
    formality: 0.5,
    emojiUsage: "minimal",
    responseLength: "balanced",
  },
  language: {
    primary: "en",
    fallback: "en",
    autoDetect: true,
  },
  systemPrompt:
    "You are Keeni, a helpful customer support assistant. Be concise, professional, and empathetic.",
  guardRails: ["Never promise refunds or credits without explicit approval."],
  sensitiveTopics: ["legal", "complaint", "threat"],
  capabilities: ["answer_questions", "escalate_to_human", "search_knowledge"],
};

export function parseBrandPersonality(value: unknown, brandName?: string): BrandPersonality {
  if (!value || typeof value !== "object") {
    return brandPersonalitySchema.parse({
      ...DEFAULT_BRAND_PERSONALITY,
      ...(brandName ? { name: brandName } : {}),
    });
  }
  const parsed = brandPersonalitySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return brandPersonalitySchema.parse({
    ...DEFAULT_BRAND_PERSONALITY,
    ...(brandName ? { name: brandName } : {}),
  });
}

export function buildAgentSystemPrompt(personality: BrandPersonality): string {
  const guardRails =
    personality.guardRails.length > 0
      ? `Guardrails:\n${personality.guardRails.map((rule) => `- ${rule}`).join("\n")}`
      : "";
  const voice = `Voice: ${personality.voice.tone}, ${personality.voice.responseLength} responses.`;
  return [personality.systemPrompt, voice, guardRails].filter(Boolean).join("\n\n");
}
