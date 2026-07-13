import { describe, expect, it } from "vitest";
import { WORKFLOW_TRIGGERS } from "./schema.js";
import { DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES, resolveInactivityMs } from "./triggers.js";

describe("resolveInactivityMs", () => {
  it("exposes the documented workflow trigger set", () => {
    expect(WORKFLOW_TRIGGERS).toEqual([
      "page_view",
      "new_messenger_conversation",
      "first_message",
      "any_message",
      "teammate_message",
      "conversation_state_changed",
      "assigned_to_team",
      "assigned_to_member",
      "customer_unresponsive",
      "teammate_unresponsive",
      "teammate_added_note",
      "ticket_created",
      "ticket_state_changed",
      "schedule",
      "webhook",
      "event_match",
    ]);
  });

  it("defaults customer_unresponsive to 30 minutes", () => {
    expect(resolveInactivityMs({ trigger: "customer_unresponsive" })).toBe(
      DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES * 60_000,
    );
  });

  it("defaults teammate_unresponsive to 30 minutes", () => {
    expect(resolveInactivityMs({ trigger: "teammate_unresponsive" })).toBe(
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
