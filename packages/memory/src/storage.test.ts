import { describe, expect, it } from "vitest";
import { buildKeeniMastraStorage, resolveKeeniMemoryStorageUrl } from "./storage.js";

describe("KeenAI Mastra storage", () => {
  it("prefers explicit storageUrl over env defaults", () => {
    expect(resolveKeeniMemoryStorageUrl({ storageUrl: "file:/tmp/custom.db" })).toBe(
      "file:/tmp/custom.db",
    );
  });

  it("uses in-memory LibSQL during vitest runs", () => {
    expect(resolveKeeniMemoryStorageUrl()).toBe(":memory:");
  });

  it("builds brand-scoped LibSQL stores", () => {
    const bundle = buildKeeniMastraStorage({
      orgId: "org-1",
      brandId: "brand-1",
      storageUrl: ":memory:",
    });
    expect(bundle.storageUrl).toBe(":memory:");
    expect(bundle.storage).toBeTruthy();
    expect(bundle.vector).toBeTruthy();
  });

  it("can omit vector index when disabled", () => {
    const bundle = buildKeeniMastraStorage({
      orgId: "org-1",
      brandId: "brand-1",
      storageUrl: ":memory:",
      withVector: false,
    });
    expect(bundle.vector).toBeUndefined();
  });
});
