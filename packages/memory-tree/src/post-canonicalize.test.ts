import { describe, expect, it, vi } from "vitest";
import {
  MEMORY_TREE_EXTRACT_CHUNK_EVENT,
  buildExtractChunkEnqueuePayload,
  enqueueExtractChunkIfAdmitted,
  shouldEnqueueExtractChunk,
  shouldEnqueueExtractChunkAfterPersist,
} from "./post-canonicalize.js";
import { prepareMemoryChunkFromMessage } from "./prepare-chunk.js";

describe("post-canonicalize extract_chunk enqueue", () => {
  const scope = { orgId: "org1", brandId: "brand1" };

  it("enqueues extract_chunk for admitted substantive messages", async () => {
    const prepared = prepareMemoryChunkFromMessage({
      ...scope,
      conversationId: "conv1",
      messageId: "msg1",
      senderType: "user",
      sentAt: new Date(),
      plainText: "Need help with billing for order ORD-99",
    });

    expect(shouldEnqueueExtractChunk(prepared, { created: true })).toBe(true);
    expect(buildExtractChunkEnqueuePayload(prepared, scope)).toEqual({
      orgId: "org1",
      brandId: "brand1",
      chunkId: prepared.chunkId,
    });

    const enqueue = vi.fn(async () => {});
    const queued = await enqueueExtractChunkIfAdmitted(
      { ...scope, chunkId: prepared.chunkId, prepared, created: true },
      enqueue,
    );

    expect(queued).toBe(true);
    expect(enqueue).toHaveBeenCalledWith({
      orgId: "org1",
      brandId: "brand1",
      chunkId: prepared.chunkId,
    });
  });

  it("skips enqueue for dropped or deduped chunks", async () => {
    const dropped = prepareMemoryChunkFromMessage({
      ...scope,
      conversationId: "conv1",
      messageId: "msg2",
      senderType: "user",
      sentAt: new Date(),
      plainText: "谢谢",
    });

    expect(shouldEnqueueExtractChunk(dropped)).toBe(false);

    const admitted = prepareMemoryChunkFromMessage({
      ...scope,
      conversationId: "conv1",
      messageId: "msg3",
      senderType: "user",
      sentAt: new Date(),
      plainText: "Refund for order ORD-88 please",
    });

    expect(shouldEnqueueExtractChunk(admitted, { created: false })).toBe(false);

    const enqueue = vi.fn(async () => {});
    const queued = await enqueueExtractChunkIfAdmitted(
      { ...scope, chunkId: admitted.chunkId, prepared: admitted, created: false },
      enqueue,
    );
    expect(queued).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("gates enqueue from persist result lifecycle", () => {
    expect(shouldEnqueueExtractChunkAfterPersist({ created: true, lifecycle: "admitted" })).toBe(
      true,
    );
    expect(shouldEnqueueExtractChunkAfterPersist({ created: true, lifecycle: "dropped" })).toBe(
      false,
    );
    expect(shouldEnqueueExtractChunkAfterPersist({ created: false, lifecycle: "admitted" })).toBe(
      false,
    );
  });

  it("exports the extract_chunk Inngest event name", () => {
    expect(MEMORY_TREE_EXTRACT_CHUNK_EVENT).toBe("keenai/memory.extract_chunk");
  });
});
