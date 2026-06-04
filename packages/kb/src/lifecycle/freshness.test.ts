import { describe, expect, it } from "vitest";
import {
  getKbFreshnessHalfLifeDays,
  parseKbFreshnessYaml,
  resetKbFreshnessConfigCacheForTests,
} from "./freshness.js";

describe("KB-15 freshness", () => {
  it("parses yaml rules per source type", () => {
    const config = parseKbFreshnessYaml(`
sources:
  help_center:
    halfLifeDays: null
  web:
    halfLifeDays: 30
default:
  halfLifeDays: 90
`);
    expect(getKbFreshnessHalfLifeDays("help_center", config)).toBeNull();
    expect(getKbFreshnessHalfLifeDays("web", config)).toBe(30);
    expect(getKbFreshnessHalfLifeDays("github", config)).toBe(90);
  });

  it("loads bundled config file", () => {
    resetKbFreshnessConfigCacheForTests();
    expect(getKbFreshnessHalfLifeDays("help_center")).toBeNull();
    expect(getKbFreshnessHalfLifeDays("web")).toBe(30);
    expect(getKbFreshnessHalfLifeDays("resolved_conversations")).toBe(90);
  });
});
