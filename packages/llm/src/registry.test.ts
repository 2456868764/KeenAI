import { describe, expect, it } from "vitest";
import { createLlmRegistry } from "./registry.js";

describe("createLlmRegistry", () => {
  it("registers deepseek and kimi when keys are set", () => {
    const { listConfiguredProviderIds } = createLlmRegistry({
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
    });
    expect(listConfiguredProviderIds()).toEqual(["stub", "deepseek", "kimi"]);
  });

  it("prefers explicit LLM_PROVIDER", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      provider: "kimi",
      openaiApiKey: "sk-openai",
      kimiApiKey: "kimi-key",
    });
    expect(resolveDraftProvider().id).toBe("kimi");
  });

  it("registers gemini when key is set", () => {
    const { listConfiguredProviderIds, resolveDraftProvider } = createLlmRegistry({
      provider: "gemini",
      geminiApiKey: "gemini-key",
    });
    expect(listConfiguredProviderIds()).toEqual(["stub", "gemini"]);
    expect(resolveDraftProvider().id).toBe("gemini");
  });

  it("auto-selects openai before gemini, deepseek and kimi", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      openaiApiKey: "sk-openai",
      geminiApiKey: "gemini-key",
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
    });
    expect(resolveDraftProvider().id).toBe("openai");
  });

  it("falls back to deepseek when openai key is missing", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
    });
    expect(resolveDraftProvider().id).toBe("deepseek");
  });

  it("falls back to stub when no remote keys", () => {
    const { resolveDraftProvider } = createLlmRegistry({});
    expect(resolveDraftProvider().id).toBe("stub");
  });
});
