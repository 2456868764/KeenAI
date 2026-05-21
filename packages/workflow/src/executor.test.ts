import { describe, expect, it, vi } from "vitest";
import { runWorkflow } from "./executor.js";
import type { WorkflowDefinition } from "./schema.js";

describe("runWorkflow", () => {
  it("runs send_message, assign and close blocks in order", async () => {
    const sendMessage = vi.fn(async () => {});
    const assign = vi.fn(async () => {});
    const close = vi.fn(async () => {});

    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [
        { id: "b1", type: "send_message", plainText: "Thanks for reaching out!" },
        { id: "b2", type: "assign", assigneeId: "member-1" },
        { id: "b3", type: "close" },
      ],
    };

    const result = await runWorkflow(definition, { sendMessage, assign, close });

    expect(sendMessage).toHaveBeenCalledWith("Thanks for reaching out!");
    expect(assign).toHaveBeenCalledWith("member-1");
    expect(close).toHaveBeenCalledOnce();
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.status === "ok")).toBe(true);
  });

  it("stops on first block error", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("send_failed");
    });
    const close = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          { id: "b1", type: "send_message", plainText: "Hi" },
          { id: "b2", type: "close" },
        ],
      },
      { sendMessage, assign: vi.fn(), close },
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.status).toBe("error");
    expect(close).not.toHaveBeenCalled();
  });
});
