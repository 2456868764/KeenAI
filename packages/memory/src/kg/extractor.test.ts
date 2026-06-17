import { describe, expect, it } from "vitest";
import { type GenerateObjectFn, extractKgFromSummaryText } from "./extractor.js";

describe("extractKgFromSummaryText", () => {
  it("falls back to deterministic stub rules without API credentials", async () => {
    const result = await extractKgFromSummaryText(
      {
        title: "Billing support",
        summary: "Customer asked about Pro plan upgrade and order ORD-88888 billing.",
      },
      { apiKey: null, model: null },
    );

    expect(result.source).toBe("stub");
    expect(result.entities.some((entity) => entity.name === "Pro Plan")).toBe(true);
    expect(result.relations.some((relation) => relation.relationType === "concerns")).toBe(true);
  });

  it("maps generateObject output into memory-tree entity and relation shapes", async () => {
    const result = await extractKgFromSummaryText(
      {
        title: "Enterprise rollout",
        summary: "Acme Corp requested SSO for their Pro Plan rollout.",
      },
      {
        apiKey: "test-key",
        model: "gpt-4o-mini",
        generateObject: (async () => ({
          object: {
            entities: [
              { type: "org", name: "Acme Corp", aliases: [], attributes: {} },
              { type: "product", name: "Pro Plan", aliases: ["Pro"], attributes: {} },
            ],
            relations: [
              {
                fromName: "Acme Corp",
                fromType: "org",
                relationType: "requested",
                toName: "Pro Plan",
                toType: "product",
                confidence: 0.92,
              },
            ],
          },
        })) as GenerateObjectFn,
      },
    );

    expect(result.source).toBe("llm");
    expect(result.model).toBe("openai/gpt-4o-mini");
    expect(result.entities).toHaveLength(2);
    expect(result.relations[0]?.relationType).toBe("requested");
  });
});
