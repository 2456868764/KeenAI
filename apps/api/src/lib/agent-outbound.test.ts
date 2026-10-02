import { describe, expect, it, vi } from "vitest";
import { readExternalAttachmentBytes } from "./agent-outbound.js";

describe("agent outbound external attachment streaming", () => {
  it("cancels a chunked response as soon as it exceeds the byte limit", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
        },
        cancel,
      }),
    );

    await expect(readExternalAttachmentBytes(response, 5)).rejects.toThrow("invalid_attachments");
    expect(cancel).toHaveBeenCalledWith("invalid_attachments");
  });

  it("assembles a bounded chunked response", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3]));
          controller.close();
        },
      }),
    );

    await expect(readExternalAttachmentBytes(response, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
