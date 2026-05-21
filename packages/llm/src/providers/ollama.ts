import { createOpenAiCompatibleDraftProvider } from "./openai-compatible.js";

export const OLLAMA_DEFAULT_MODEL = "llama3.2";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

export function createOllamaDraftProvider(config: { baseUrl?: string; model?: string }) {
  return createOpenAiCompatibleDraftProvider({
    id: "ollama",
    apiKey: "ollama",
    model: config.model ?? OLLAMA_DEFAULT_MODEL,
    baseURL: config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
  });
}
