import { describe, expect, it } from "vitest";
import { signChannelWorkflowButton, verifyChannelWorkflowButton } from "./channel-action-token.js";

const payload = {
  orgId: "org-1",
  conversationId: "conversation-1",
  workflowRunId: "run-1",
  blockId: "buttons-1",
  buttonId: "sales",
};

describe("channel workflow button token", () => {
  it("round-trips a valid token", () => {
    const token = signChannelWorkflowButton({ ...payload, expiresAt: 2_000 }, "secret");
    expect(verifyChannelWorkflowButton(token, "secret", 1_000)).toEqual({
      ...payload,
      expiresAt: 2_000,
    });
  });

  it("rejects tampered and expired tokens", () => {
    const token = signChannelWorkflowButton({ ...payload, expiresAt: 2_000 }, "secret");
    expect(verifyChannelWorkflowButton(`${token}x`, "secret", 1_000)).toBeNull();
    expect(verifyChannelWorkflowButton(token, "secret", 2_001)).toBeNull();
  });
});
