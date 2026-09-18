/** @vitest-environment jsdom */
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "./ChatView.js";

const conversation = { id: "conversation-1", status: "open", subject: null };
const answerState = {
  status: "done" as const,
  text: "Here is the answer.",
  citations: [],
};
const mounted: HTMLElement[] = [];

function renderChat(allowHandoff: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  mounted.push(container);
  render(
    h(ChatView, {
      apiUrl: "http://localhost:8090",
      accessToken: "widget-token",
      conversation,
      messages: [],
      answerState,
      handoffRequested: false,
      allowHandoff,
      onSend: vi.fn(),
      onRequestHandoff: vi.fn(),
      onSubmitWorkflowTicketForm: vi.fn(),
      onUploadImage: vi.fn(),
      fetchAttachmentBlob: vi.fn(),
    }),
    container,
  );
  return container;
}

describe("ChatView handoff setting", () => {
  afterEach(() => {
    for (const container of mounted.splice(0)) render(null, container);
    document.body.replaceChildren();
  });

  it("shows the support handoff action when enabled", () => {
    const container = renderChat(true);
    expect(container.textContent).toContain("Contact support");
  });

  it("hides the support handoff action when disabled", () => {
    const container = renderChat(false);
    expect(container.textContent).not.toContain("Contact support");
  });
});
