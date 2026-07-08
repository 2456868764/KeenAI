import { describe, expect, it } from "vitest";
import { createLlmRegistry } from "./registry.js";

describe("createLlmRegistry", () => {
  it("registers Chinese OpenAI-compatible providers when keys are set", () => {
    const { listConfiguredProviderIds } = createLlmRegistry({
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
      qwenApiKey: "qwen-key",
      zhipuApiKey: "zhipu-key",
    });
    expect(listConfiguredProviderIds()).toEqual(["stub", "deepseek", "kimi", "qwen", "zhipu"]);
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

  it("auto-selects openai before gemini and Chinese providers", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      openaiApiKey: "sk-openai",
      geminiApiKey: "gemini-key",
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
      qwenApiKey: "qwen-key",
      zhipuApiKey: "zhipu-key",
    });
    expect(resolveDraftProvider().id).toBe("openai");
  });

  it("falls back to deepseek when openai key is missing", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      deepseekApiKey: "ds-key",
      kimiApiKey: "kimi-key",
      qwenApiKey: "qwen-key",
    });
    expect(resolveDraftProvider().id).toBe("deepseek");
  });

  it("lists provider summaries with labels", () => {
    const { listProviderSummaries } = createLlmRegistry({
      provider: "qwen",
      qwenApiKey: "qwen-key",
      qwenModel: "qwen-max",
    });
    const items = listProviderSummaries();
    expect(items.find((p) => p.id === "qwen")?.label).toBe("Qwen (DashScope)");
    expect(items.find((p) => p.id === "qwen")?.model).toBe("qwen-max");
    expect(items.find((p) => p.id === "qwen")?.isDefault).toBe(true);
  });

  it("registers anthropic and ollama when configured", () => {
    const { listConfiguredProviderIds } = createLlmRegistry({
      anthropicApiKey: "ant-key",
      ollamaBaseUrl: "http://localhost:11434/v1",
    });
    expect(listConfiguredProviderIds()).toEqual(["stub", "anthropic", "ollama"]);
  });

  it("auto-selects anthropic after openai", () => {
    const { resolveDraftProvider } = createLlmRegistry({
      anthropicApiKey: "ant-key",
      geminiApiKey: "gemini-key",
    });
    expect(resolveDraftProvider().id).toBe("anthropic");
  });

  it("falls back to stub when no remote keys", () => {
    const { resolveDraftProvider } = createLlmRegistry({});
    expect(resolveDraftProvider().id).toBe("stub");
  });
});
