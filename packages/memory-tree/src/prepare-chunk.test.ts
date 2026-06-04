import { describe, expect, it } from "vitest";
import { computeMemoryChunkId } from "./chunk-id.js";
import { prepareMemoryChunkFromMessage } from "./prepare-chunk.js";

describe("prepareMemoryChunkFromMessage", () => {
  it("canonicalizes, hashes, and admits substantive messages", () => {
    const sentAt = new Date("2026-05-21T10:00:00.000Z");
    const prepared = prepareMemoryChunkFromMessage({
      orgId: "org1",
      brandId: "brand1",
      conversationId: "conv1",
      messageId: "msg1",
      senderType: "user",
      sentAt,
      plainText: "I need help with order ORD-12345",
    });

    expect(prepared.source).toBe("conversation_message");
    expect(prepared.sourceRef).toBe("message:msg1");
    expect(prepared.bodyMd).toContain("ORD-12345");
    expect(prepared.lifecycle).toBe("admitted");
    expect(prepared.shouldPersist).toBe(true);
    expect(prepared.chunkId).toBe(
      computeMemoryChunkId("org1", "brand1", "message:msg1", prepared.bodyMd),
    );
  });

  it("marks pleasantries as dropped without persisting", () => {
    const prepared = prepareMemoryChunkFromMessage({
      orgId: "org1",
      brandId: "brand1",
      conversationId: "conv1",
      messageId: "msg2",
      senderType: "user",
      sentAt: new Date(),
      plainText: "谢谢",
    });

    expect(prepared.lifecycle).toBe("dropped");
    expect(prepared.shouldPersist).toBe(false);
  });
});
