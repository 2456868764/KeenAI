import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

export function createOpenaiDraftProvider(config: { apiKey: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "openai",
    apiKey: config.apiKey,
    model: config.model ?? "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1",
  });
}
