import type { LlmConfig, LlmProviderId } from "./types.js";

export const PROVIDER_LABELS: Record<LlmProviderId, string> = {
  stub: "Stub (offline)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  kimi: "Kimi (Moonshot)",
  gemini: "Google Gemini",
  ollama: "Ollama (local)",
};

export type CopilotProviderSummary = {
  id: LlmProviderId;
  label: string;
  model?: string;
  isDefault: boolean;
};

export function resolveProviderModel(config: LlmConfig, id: LlmProviderId): string | undefined {
  switch (id) {
    case "openai":
      return config.openaiModel;
    case "anthropic":
      return config.anthropicModel;
    case "deepseek":
      return config.deepseekModel;
    case "kimi":
      return config.kimiModel;
    case "gemini":
      return config.geminiModel;
    case "ollama":
      return config.ollamaModel;
    default:
      return undefined;
  }
}

export function buildProviderSummaries(
  config: LlmConfig,
  ids: LlmProviderId[],
  defaultId: LlmProviderId,
): CopilotProviderSummary[] {
  return ids.map((id) => ({
    id,
    label: PROVIDER_LABELS[id],
    model: resolveProviderModel(config, id),
    isDefault: id === defaultId,
  }));
}
