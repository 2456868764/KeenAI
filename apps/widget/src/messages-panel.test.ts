/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { MessagesPanel } from "./messages-panel.js";

describe("MessagesPanel", () => {
  it("dedupes messages by id and disables send while pending", async () => {
    const container = document.createElement("div");
    const onSend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        }),
    );

    const panel = new MessagesPanel({
      container,
      apiUrl: "http://localhost:8090",
      accessToken: "token",
      onSend,
      onUploadImage: vi.fn(async () => "att1"),
      fetchAttachmentBlob: vi.fn(async () => "blob:mock"),
    });
    panel.renderHistory([{ id: "m1", plainText: "hi", senderType: "user" }]);
    panel.handleRealtime({
      type: "message.created",
      message: { id: "m1", plainText: "hi", senderType: "user" },
    });

    expect(container.querySelectorAll(".keenai-bubble")).toHaveLength(1);

    const form = container.querySelector("form") as HTMLFormElement;
    const input = container.querySelector(".keenai-input") as HTMLInputElement;
    input.value = "hello";
    form.requestSubmit();

    expect(input.disabled).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(onSend).toHaveBeenCalledWith({ plainText: "hello" });
    expect(input.disabled).toBe(false);
  });

  it("renders audio attachments with a player", () => {
    const container = document.createElement("div");
    const fetchAttachmentBlob = vi.fn(async () => "blob:audio");

    const panel = new MessagesPanel({
      container,
      apiUrl: "http://localhost:8090",
      accessToken: "token",
      onSend: vi.fn(async () => {}),
      onUploadImage: vi.fn(async () => "att1"),
      fetchAttachmentBlob,
    });

    panel.renderHistory([
      {
        id: "m-voice",
        plainText: "[Voice message]",
        senderType: "ai",
        messageKind: "voice",
        attachments: [
          {
            id: "att-voice",
            fileName: "speech.wav",
            contentType: "audio/wav",
            sizeBytes: 1024,
          },
        ],
      },
    ]);

    const audio = container.querySelector(".keenai-bubble__audio") as HTMLAudioElement;
    expect(audio).toBeTruthy();
    expect(audio.controls).toBe(true);
    expect(fetchAttachmentBlob).toHaveBeenCalledWith("att-voice");
  });
});
