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

    const panel = new MessagesPanel({ container, onSend });
    panel.renderHistory([{ id: "m1", plainText: "hi", senderType: "user" }]);
    panel.handleRealtime({
      type: "message.created",
      message: { id: "m1", plainText: "hi", senderType: "user" },
    });

    expect(container.querySelectorAll(".keenai-bubble")).toHaveLength(1);

    const form = container.querySelector("form") as HTMLFormElement;
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "hello";
    form.requestSubmit();

    expect(input.disabled).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input.disabled).toBe(false);
  });
});
