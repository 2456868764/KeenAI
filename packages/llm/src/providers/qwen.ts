import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

/** Alibaba Cloud DashScope OpenAI-compatible endpoint for Qwen. */
export const QWEN_DEFAULT_MODEL = "qwen-plus";
export const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function createQwenDraftProvider(config: { apiKey: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "qwen",
    apiKey: config.apiKey,
    model: config.model ?? QWEN_DEFAULT_MODEL,
    baseURL: QWEN_BASE_URL,
  });
}
