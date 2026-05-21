import { describe, expect, it } from "vitest";
import { BUILTIN_MACROS, getMacroBySlug } from "./macros.js";

describe("macros", () => {
  it("includes refund macro", () => {
    expect(BUILTIN_MACROS.some((m) => m.slug === "refund")).toBe(true);
    expect(getMacroBySlug("refund")?.body).toContain("refund");
  });
});
