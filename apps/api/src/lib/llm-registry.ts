import { createLlmRegistry } from "@keenai/llm";
import type { parseApiEnv } from "@keenai/shared";

export function createApiLlmRegistry(env: ReturnType<typeof parseApiEnv>) {
  return createLlmRegistry({
    provider: env.LLM_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    deepseekModel: env.DEEPSEEK_MODEL,
    kimiApiKey: env.KIMI_API_KEY,
    kimiModel: env.KIMI_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaModel: env.OLLAMA_MODEL,
  });
}
