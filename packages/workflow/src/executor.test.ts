import { describe, expect, it, vi } from "vitest";
import { resolveLetKeeniAnswerNext } from "./blocks/let-keeni-answer.js";
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

    expect(sendMessage).toHaveBeenCalledWith({
      plainText: "Thanks for reaching out!",
      attachmentIds: undefined,
    });
    expect(assign).toHaveBeenCalledWith("member-1");
    expect(close).toHaveBeenCalledOnce();
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.status === "ok")).toBe(true);
  });

  it("passes attachmentIds to sendMessage handler", async () => {
    const sendMessage = vi.fn(async () => {});

    await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "b1",
            type: "send_message",
            plainText: "See attached",
            attachmentIds: ["att-1", "att-2"],
          },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
    );

    expect(sendMessage).toHaveBeenCalledWith({
      plainText: "See attached",
      attachmentIds: ["att-1", "att-2"],
    });
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

  it("records agent output from let_keeni_answer block", async () => {
    const letKeeniAnswer = vi.fn(async () => ({
      replyText: "Issue is resolved.",
      resolution: { type: "assumed" as const, confidence: 0.7, evidence: "resolved" },
      nextBlockId: "next-1",
    }));

    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [
        {
          id: "ai-1",
          type: "let_keeni_answer",
          maxSteps: 5,
          outcomeRouting: {
            resolvedNext: "next-1",
            unresolvedNext: null,
            escalatedNext: null,
          },
        },
      ],
    };

    const result = await runWorkflow(
      definition,
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        letKeeniAnswer,
      },
      {
        workflowId: "wf-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
    );

    expect(letKeeniAnswer).toHaveBeenCalledOnce();
    expect(result.steps[0]).toMatchObject({
      blockId: "ai-1",
      type: "let_keeni_answer",
      status: "ok",
      output: {
        replyText: "Issue is resolved.",
        resolutionType: "assumed",
        nextBlockId: "next-1",
      },
    });
  });
});

describe("resolveLetKeeniAnswerNext", () => {
  it("routes by resolution type", () => {
    const routing = {
      resolvedNext: "close-block",
      unresolvedNext: "follow-up",
      escalatedNext: "human-handoff",
    };
    expect(resolveLetKeeniAnswerNext("confirmed", routing)).toBe("close-block");
    expect(resolveLetKeeniAnswerNext("escalated", routing)).toBe("human-handoff");
    expect(resolveLetKeeniAnswerNext("unresolved", routing)).toBe("follow-up");
  });
});
