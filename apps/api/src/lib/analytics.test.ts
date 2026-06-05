import { describe, expect, it } from "vitest";
import { fillDailySeries, lastNDays } from "./analytics.js";

describe("analytics helpers", () => {
  it("lastNDays returns consecutive ISO dates ending today", () => {
    const days = lastNDays(3);
    expect(days).toHaveLength(3);
    expect(days[2]).toBe(new Date().toISOString().slice(0, 10));
  });

  it("fillDailySeries pads missing days with zero", () => {
    const filled = fillDailySeries(
      [
        { day: "2026-01-01", count: 2 },
        { day: "2026-01-03", count: 5 },
      ],
      ["2026-01-01", "2026-01-02", "2026-01-03"],
    );
    expect(filled).toEqual([
      { day: "2026-01-01", count: 2 },
      { day: "2026-01-02", count: 0 },
      { day: "2026-01-03", count: 5 },
    ]);
  });
});
