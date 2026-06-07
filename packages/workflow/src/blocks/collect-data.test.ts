import { describe, expect, it } from "vitest";
import { collectDataBlockSchema } from "./collect-data.js";

describe("collectDataBlockSchema", () => {
  it("accepts a valid collect_data block", () => {
    const parsed = collectDataBlockSchema.parse({
      id: "collect-1",
      type: "collect_data",
      prompt: "What is your email?",
      allowFreeText: false,
      fields: [{ key: "email", label: "Email", required: true }],
      autoCloseMinutes: 5,
    });
    expect(parsed.fields).toHaveLength(1);
  });

  it("rejects invalid auto-close minutes", () => {
    expect(() =>
      collectDataBlockSchema.parse({
        id: "collect-1",
        type: "collect_data",
        prompt: "Name?",
        fields: [{ key: "name", label: "Name", required: true }],
        autoCloseMinutes: 2,
      }),
    ).toThrow();
  });
});
