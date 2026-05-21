import { buildProviderSummaries } from "./provider-meta.js";
import { createAnthropicDraftProvider } from "./providers/anthropic.js";
import { createDeepseekDraftProvider } from "./providers/deepseek.js";
import { createGeminiDraftProvider } from "./providers/gemini.js";
import { createKimiDraftProvider } from "./providers/kimi.js";
import { createOllamaDraftProvider } from "./providers/ollama.js";
import { createOpenaiDraftProvider } from "./providers/openai.js";
import { stubDraftProvider } from "./providers/stub.js";
import type { DraftProvider, LlmConfig, LlmProviderId } from "./types.js";

const REMOTE_PROVIDER_ORDER: LlmProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "kimi",
  "ollama",
];

function registerRemoteProviders(config: LlmConfig): DraftProvider[] {
  const providers: DraftProvider[] = [];

  if (config.openaiApiKey) {
    providers.push(
      createOpenaiDraftProvider({
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
      }),
    );
  }

  if (config.anthropicApiKey) {
    providers.push(
      createAnthropicDraftProvider({
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
      }),
    );
  }

  if (config.deepseekApiKey) {
    providers.push(
      createDeepseekDraftProvider({
        apiKey: config.deepseekApiKey,
        model: config.deepseekModel,
      }),
    );
  }

  if (config.kimiApiKey) {
    providers.push(
      createKimiDraftProvider({
        apiKey: config.kimiApiKey,
        model: config.kimiModel,
      }),
    );
  }

  if (config.geminiApiKey) {
    providers.push(
      createGeminiDraftProvider({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      }),
    );
  }

  if (config.ollamaBaseUrl) {
    providers.push(
      createOllamaDraftProvider({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
      }),
    );
  }

  return providers;
}

export function createLlmRegistry(config: LlmConfig = {}) {
  const remoteProviders = registerRemoteProviders(config);
  const providers: DraftProvider[] = [stubDraftProvider, ...remoteProviders];

  function resolveDraftProvider(): DraftProvider {
    if (config.provider && config.provider !== "stub") {
      const preferred = remoteProviders.find((p) => p.id === config.provider);
      if (preferred) return preferred;
    }

    if (config.provider === "stub") return stubDraftProvider;

    for (const id of REMOTE_PROVIDER_ORDER) {
      const match = remoteProviders.find((p) => p.id === id);
      if (match) return match;
    }

    return stubDraftProvider;
  }

  function listConfiguredProviderIds(): LlmProviderId[] {
    return providers.map((p) => p.id);
  }

  function getProvider(id: LlmProviderId): DraftProvider | undefined {
    return providers.find((p) => p.id === id);
  }

  function listProviderSummaries() {
    const defaultId = resolveDraftProvider().id;
    return buildProviderSummaries(config, listConfiguredProviderIds(), defaultId);
  }

  return {
    resolveDraftProvider,
    getProvider,
    providers,
    listConfiguredProviderIds,
    listProviderSummaries,
  };
}
