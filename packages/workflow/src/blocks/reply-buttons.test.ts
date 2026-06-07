import { describe, expect, it } from "vitest";
import { replyButtonsBlockSchema, resolveReplyButtonsNext } from "./reply-buttons.js";

describe("replyButtonsBlockSchema", () => {
  it("accepts a valid reply_buttons block", () => {
    const parsed = replyButtonsBlockSchema.parse({
      id: "buttons-1",
      type: "reply_buttons",
      prompt: "How can we help?",
      allowFreeText: false,
      buttons: [
        { id: "sales", label: "Sales", nextId: "sales-path" },
        { id: "support", label: "Support", nextId: null },
      ],
      autoCloseMinutes: 10,
    });
    expect(parsed.buttons).toHaveLength(2);
  });
});

describe("resolveReplyButtonsNext", () => {
  it("returns the configured next block for a clicked button", () => {
    const block = replyButtonsBlockSchema.parse({
      id: "buttons-1",
      type: "reply_buttons",
      prompt: "Pick one",
      buttons: [{ id: "yes", label: "Yes", nextId: "yes-path" }],
    });
    expect(resolveReplyButtonsNext(block, "yes")).toBe("yes-path");
    expect(resolveReplyButtonsNext(block, "missing")).toBeNull();
  });
});
