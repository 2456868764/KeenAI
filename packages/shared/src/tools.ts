import { z } from "zod";

export const textToSpeechSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.string().min(1).max(64).optional(),
  /** When true, embed [[audio_as_voice]] in agentOutboundText for voice bubble delivery */
  asVoice: z.boolean().optional().default(true),
});

export type TextToSpeechInput = z.infer<typeof textToSpeechSchema>;

export const generateImageSchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.enum(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]).optional(),
  /** Optional alt text for markdown outbound */
  alt: z.string().max(200).optional(),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
