import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export function createDeepseekDraftProvider(config: { apiKey: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "deepseek",
    apiKey: config.apiKey,
    model: config.model ?? DEEPSEEK_DEFAULT_MODEL,
    baseURL: DEEPSEEK_BASE_URL,
  });
}
