import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

/** Zhipu GLM OpenAI-compatible endpoint. */
export const ZHIPU_DEFAULT_MODEL = "glm-4-flash";
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export function createZhipuDraftProvider(config: { apiKey: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "zhipu",
    apiKey: config.apiKey,
    model: config.model ?? ZHIPU_DEFAULT_MODEL,
    baseURL: ZHIPU_BASE_URL,
  });
}
