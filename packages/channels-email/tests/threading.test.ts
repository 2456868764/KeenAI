import { describe, expect, it } from "vitest";
import { normalizeSubject, resolveThreadChannelId } from "../src/threading.js";

describe("email threading", () => {
  it("normalizes Re:/Fwd: prefixes", () => {
    expect(normalizeSubject("Re: Fwd:  Help")).toBe("Help");
  });

  it("prefers In-Reply-To over subject", () => {
    const thread = resolveThreadChannelId(
      {
        messageId: "<m2@x>",
        inReplyTo: "<m1@x>",
        references: [],
        subject: "Re: Other",
      },
      [{ channelId: "<m1@x>", subject: "Help" }],
    );
    expect(thread.channelId).toBe("<m1@x>");
    expect(thread.matchReason).toBe("in-reply-to");
  });

  it("falls back to normalized subject match", () => {
    const thread = resolveThreadChannelId(
      {
        messageId: "<m3@x>",
        references: [],
        subject: "Re: Help with billing",
      },
      [{ channelId: "<root@x>", subject: "Help with billing" }],
    );
    expect(thread.channelId).toBe("<root@x>");
    expect(thread.matchReason).toBe("subject");
  });
});
