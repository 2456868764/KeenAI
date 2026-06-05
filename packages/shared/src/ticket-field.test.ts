import { describe, expect, it } from "vitest";
import { parseTicketFields, validateTicketCustomFields } from "./ticket-field.js";

describe("ticket field DSL", () => {
  it("parses valid field definitions", () => {
    const fields = parseTicketFields([
      { key: "plan", label: "Plan", type: "select", options: ["free", "pro"], required: true },
      { key: "seats", label: "Seats", type: "number" },
    ]);
    expect(fields).toHaveLength(2);
    expect(fields[0]?.key).toBe("plan");
  });

  it("rejects invalid stored fields", () => {
    expect(parseTicketFields([{ key: "BAD", label: "", type: "text" }])).toEqual([]);
  });

  it("validates required and typed values", () => {
    const fields = parseTicketFields([
      { key: "plan", label: "Plan", type: "select", options: ["free"], required: true },
      { key: "seats", label: "Seats", type: "number" },
    ]);

    expect(validateTicketCustomFields(fields, {})).toEqual({
      ok: false,
      errors: { plan: "required" },
    });

    expect(validateTicketCustomFields(fields, { plan: "free", seats: 3 })).toEqual({ ok: true });
    expect(validateTicketCustomFields(fields, { plan: "enterprise", seats: 3 })).toEqual({
      ok: false,
      errors: { plan: "invalid_select" },
    });
  });
});
