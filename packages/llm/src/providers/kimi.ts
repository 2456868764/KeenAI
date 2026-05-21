import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

/** Moonshot (Kimi) OpenAI-compatible endpoint. */
export const KIMI_DEFAULT_MODEL = "moonshot-v1-8k";
export const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

export function createKimiDraftProvider(config: { apiKey: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "kimi",
    apiKey: config.apiKey,
    model: config.model ?? KIMI_DEFAULT_MODEL,
    baseURL: KIMI_BASE_URL,
  });
}
