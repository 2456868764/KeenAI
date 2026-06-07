import { describe, expect, it } from "vitest";
import { snoozeBlockSchema } from "./snooze.js";

describe("snoozeBlockSchema", () => {
  it("accepts snooze minutes", () => {
    const parsed = snoozeBlockSchema.parse({
      id: "snooze-1",
      type: "snooze",
      minutes: 60,
    });
    expect(parsed.minutes).toBe(60);
  });
});
