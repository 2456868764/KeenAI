import type { LlmConfig, LlmProviderId } from "./types.js";

export const PROVIDER_LABELS: Record<LlmProviderId, string> = {
  stub: "Stub (offline)",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  kimi: "Kimi (Moonshot)",
  gemini: "Google Gemini",
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
    case "deepseek":
      return config.deepseekModel;
    case "kimi":
      return config.kimiModel;
    case "gemini":
      return config.geminiModel;
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
