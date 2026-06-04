import { describe, expect, it } from "vitest";
import { hashKbChunkContent, planKbDocumentDiffIndex } from "./diff-index.js";

describe("KB-17 diff index", () => {
  it("keeps chunk id when content hash unchanged", () => {
    const content = "Billing policy paragraph.";
    const plan = planKbDocumentDiffIndex(
      [{ id: "chunk-old", chunkIndex: 0, contentHash: hashKbChunkContent(content) }],
      [{ chunkIndex: 0, sectionId: "s1", content, contextPrefix: "FAQ > Billing" }],
    );
    expect(plan.keep).toHaveLength(1);
    expect(plan.keep[0]?.id).toBe("chunk-old");
    expect(plan.insert).toHaveLength(0);
    expect(plan.removeIds).toHaveLength(0);
  });

  it("schedules insert and remove on content change", () => {
    const plan = planKbDocumentDiffIndex(
      [
        { id: "c0", chunkIndex: 0, contentHash: hashKbChunkContent("old") },
        { id: "c1", chunkIndex: 1, contentHash: hashKbChunkContent("remove me") },
      ],
      [{ chunkIndex: 0, sectionId: "s", content: "new body", contextPrefix: null }],
    );
    expect(plan.keep).toHaveLength(0);
    expect(plan.insert).toHaveLength(1);
    expect(plan.removeIds.sort()).toEqual(["c0", "c1"]);
  });
});
