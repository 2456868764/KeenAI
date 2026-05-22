import { z } from "zod";

export const textToSpeechSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.string().min(1).max(64).optional(),
  /** When true, embed [[audio_as_voice]] in agentOutboundText for voice bubble delivery */
  asVoice: z.boolean().optional().default(true),
});

export type TextToSpeechInput = z.infer<typeof textToSpeechSchema>;
