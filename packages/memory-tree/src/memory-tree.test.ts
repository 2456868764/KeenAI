import { describe, expect, it } from "vitest";
import { canonicalizeConversationMessage, conversationMessageSourceRef } from "./canonicalize.js";
import { computeMemoryChunkId } from "./chunk-id.js";
import { computeFastScore } from "./fast-score.js";

describe("memory-tree canonicalize", () => {
  it("renders frontmatter and body markdown", () => {
    const doc = canonicalizeConversationMessage({
      orgId: "org1",
      brandId: "brand1",
      source: "conversation_message",
      conversationId: "conv1",
      messageId: "msg1",
      senderType: "user",
      sentAt: new Date("2026-05-21T10:00:00.000Z"),
      plainText: "我想升级到 Pro，但担心价格。",
      attachments: [{ id: "att1", mime: "image/png", fileName: "shot.png" }],
    });

    expect(doc.bodyMd).toContain("orgId: org1");
    expect(doc.bodyMd).toContain("messageId: msg1");
    expect(doc.bodyMd).toContain('"id":"att1"');
    expect(doc.bodyMd).toContain("我想升级到 Pro");
  });

  it("uses deterministic message source ref", () => {
    expect(conversationMessageSourceRef("msg-abc")).toBe("message:msg-abc");
  });
});

describe("memory-tree fast-score", () => {
  it("admits substantive messages and drops pleasantries", () => {
    expect(
      computeFastScore({
        plainText: "I need help upgrading my plan.",
        source: "conversation_message",
        senderType: "user",
      }).lifecycle,
    ).toBe("admitted");

    expect(
      computeFastScore({
        plainText: "谢谢",
        source: "conversation_message",
        senderType: "user",
      }).lifecycle,
    ).toBe("dropped");
  });

  it("never drops internal notes or system messages", () => {
    expect(
      computeFastScore({
        plainText: "ok",
        source: "internal_note",
        senderType: "agent",
      }).lifecycle,
    ).toBe("admitted");

    expect(
      computeFastScore({
        plainText: "workflow started",
        source: "conversation_message",
        senderType: "system",
      }).lifecycle,
    ).toBe("admitted");
  });
});

describe("memory-tree chunk id", () => {
  it("is stable for the same inputs", () => {
    const a = computeMemoryChunkId("org1", "brand1", "message:msg1", "body-md");
    const b = computeMemoryChunkId("org1", "brand1", "message:msg1", "body-md");
    const c = computeMemoryChunkId("org1", "brand1", "message:msg1", "other-body");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
