import { createOpenaiDraftProvider } from "./providers/openai.js";
import { stubDraftProvider } from "./providers/stub.js";
import type { DraftProvider, LlmConfig } from "./types.js";

export function createLlmRegistry(config: LlmConfig = {}): {
  resolveDraftProvider(): DraftProvider;
  providers: DraftProvider[];
} {
  const providers: DraftProvider[] = [stubDraftProvider];

  if (config.openaiApiKey) {
    providers.push(
      createOpenaiDraftProvider({
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
      }),
    );
  }

  function resolveDraftProvider(): DraftProvider {
    if (config.openaiApiKey && config.preferOpenai !== false) {
      return providers.find((p) => p.id === "openai") ?? stubDraftProvider;
    }
    return stubDraftProvider;
  }

  return { resolveDraftProvider, providers };
}
