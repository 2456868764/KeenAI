import { describe, expect, it } from "vitest";
import { runKbIngestPipeline } from "./kb-ingest-pipeline.js";

describe("KB-16 kb ingest pipeline", () => {
  it("runs eight ingest steps with concrete default details", async () => {
    const result = await runKbIngestPipeline({
      orgId: "org",
      brandId: "brand",
      sourceId: "src",
    });
    expect(result.steps).toHaveLength(8);
    expect(result.ok).toBe(true);
    expect(result.steps.every((step) => step.ok)).toBe(true);
    expect(result.steps.map((step) => step.step)).toEqual([
      "fetch",
      "parse",
      "clean",
      "chunk",
      "enrich",
      "embed",
      "index",
      "notify",
    ]);
    expect(result.steps[0]?.detail).toBe("source:src");
    expect(result.steps.at(-1)?.detail).toBe("completed");
  });

  it("captures step failures, skips dependent steps, and still notifies", async () => {
    const result = await runKbIngestPipeline(
      {
        orgId: "org",
        brandId: "brand",
        sourceId: "src",
      },
      {
        now: (() => {
          let value = 1_000;
          return () => {
            value += 5;
            return value;
          };
        })(),
        handlers: {
          parse: async () => {
            throw new Error("parser_unavailable");
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("parse");
    expect(result.steps.find((step) => step.step === "parse")?.error).toBe("parser_unavailable");
    expect(result.steps.find((step) => step.step === "clean")?.skipped).toBe(true);
    expect(result.steps.find((step) => step.step === "notify")?.ok).toBe(true);
    expect(result.steps.find((step) => step.step === "notify")?.detail).toBe("failed:parse");
  });
});
