import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findRepoRoot, normalizeFileDatabaseUrl, resolveDatabaseUrl } from "./paths.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(thisDir);

describe("resolveDatabaseUrl", () => {
  it("resolves relative file: paths from repo root", () => {
    const url = resolveDatabaseUrl("file:./data/keenai.db", import.meta.url);
    expect(url).toBe(`file:${path.join(repoRoot, "data", "keenai.db")}`);
  });

  it("leaves absolute file: paths unchanged", () => {
    const abs = "/tmp/keenai-test.db";
    expect(normalizeFileDatabaseUrl(`file:${abs}`, import.meta.url)).toBe(`file:${abs}`);
  });

  it("leaves :memory: unchanged", () => {
    expect(resolveDatabaseUrl(":memory:", import.meta.url)).toBe(":memory:");
  });
});
