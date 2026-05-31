import { z } from "zod";

export const keenPersonalitySchema = z.object({
  name: z.string().min(1),
  voice: z.object({
    tone: z.enum(["friendly_professional", "casual", "formal"]).default("friendly_professional"),
    formality: z.number().min(0).max(1).default(0.5),
    emojiUsage: z.enum(["none", "minimal", "rich"]).default("minimal"),
    responseLength: z.enum(["concise", "balanced", "detailed"]).default("balanced"),
  }),
  language: z.object({
    primary: z.string().default("en"),
    fallback: z.string().default("en"),
    autoDetect: z.boolean().default(true),
  }),
  systemPrompt: z.string().min(1),
  guardRails: z.array(z.string()).default([]),
  sensitiveTopics: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
});

export type KeeniPersonality = z.infer<typeof keenPersonalitySchema>;

export const DEFAULT_KEENI_PERSONALITY: KeeniPersonality = {
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

export function buildPersonality(overrides: Partial<KeeniPersonality> = {}): KeeniPersonality {
  return keenPersonalitySchema.parse({ ...DEFAULT_KEENI_PERSONALITY, ...overrides });
}

export function buildAgentSystemPrompt(personality: KeeniPersonality): string {
  const guardRails =
    personality.guardRails.length > 0
      ? `Guardrails:\n${personality.guardRails.map((rule) => `- ${rule}`).join("\n")}`
      : "";
  const voice = `Voice: ${personality.voice.tone}, ${personality.voice.responseLength} responses.`;
  return [personality.systemPrompt, voice, guardRails].filter(Boolean).join("\n\n");
}
