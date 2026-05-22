import { describe, expect, it } from "vitest";
import { canonicalizeConversationMessage, conversationMessageSourceRef } from "./canonicalize.js";
import { computeMemoryChunkId } from "./chunk-id.js";

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
