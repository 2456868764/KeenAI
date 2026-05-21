import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES, resolveInactivityMs } from "./triggers.js";

describe("resolveInactivityMs", () => {
  it("defaults customer_unresponsive to 30 minutes", () => {
    expect(resolveInactivityMs({ trigger: "customer_unresponsive" })).toBe(
      DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES * 60_000,
    );
  });

  it("uses explicit inactivityMinutes", () => {
    expect(resolveInactivityMs({ trigger: "customer_unresponsive", inactivityMinutes: 5 })).toBe(
      5 * 60_000,
    );
  });

  it("allows zero for immediate scan eligibility", () => {
    expect(resolveInactivityMs({ trigger: "customer_unresponsive", inactivityMinutes: 0 })).toBe(0);
  });
});
