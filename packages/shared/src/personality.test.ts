import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_PERSONALITY,
  buildAgentSystemPrompt,
  parseBrandPersonality,
} from "./personality.js";

describe("brand personality", () => {
  it("returns defaults when settings are missing", () => {
    const p = parseBrandPersonality(null, "Acme");
    expect(p.name).toBe("Acme");
    expect(p.voice.tone).toBe("friendly_professional");
  });

  it("merges valid stored personality", () => {
    const p = parseBrandPersonality(
      {
        ...DEFAULT_BRAND_PERSONALITY,
        name: "Support Bot",
        systemPrompt: "You help Acme customers.",
      },
      "Acme",
    );
    expect(p.name).toBe("Support Bot");
    expect(p.systemPrompt).toContain("Acme customers");
  });

  it("builds agent system prompt with guardrails", () => {
    const text = buildAgentSystemPrompt({
      ...DEFAULT_BRAND_PERSONALITY,
      guardRails: ["Do not share passwords."],
    });
    expect(text).toContain("Do not share passwords.");
    expect(text).toContain("Voice:");
  });
});
