import { describe, expect, it } from "vitest";
import { runKbIngestPipeline } from "./kb-ingest-pipeline.js";

describe("KB-16 kb ingest pipeline", () => {
  it("runs eight stub steps", async () => {
    const result = await runKbIngestPipeline({
      orgId: "org",
      brandId: "brand",
      sourceId: "src",
    });
    expect(result.steps).toHaveLength(8);
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });
});
