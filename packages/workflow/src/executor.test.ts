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

  it("follows branches block to the matching next id", async () => {
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "branch-1",
            type: "branches",
            branches: [
              {
                condition: { field: "channelType", op: "eq", value: "email" },
                nextId: "email-msg",
              },
              { nextId: "default-msg" },
            ],
          },
          { id: "email-msg", type: "send_message", plainText: "Email path" },
          { id: "default-msg", type: "send_message", plainText: "Default path" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
      {
        workflowId: "wf-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
        facts: { channelType: "messenger" },
      },
    );

    expect(sendMessage).toHaveBeenCalledWith({
      plainText: "Default path",
      attachmentIds: undefined,
    });
    expect(result.steps.some((s) => s.type === "branches" && s.status === "ok")).toBe(true);
  });

  it("runs convert_to_ticket block", async () => {
    const convertToTicket = vi.fn(async () => ({ ticketId: "ticket-99" }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "t1", type: "convert_to_ticket", title: "From workflow" }],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        convertToTicket,
      },
    );

    expect(convertToTicket).toHaveBeenCalledWith({ title: "From workflow" });
    expect(result.steps[0]?.output).toMatchObject({ ticketId: "ticket-99" });
  });

  it("runs apply_rules block for all matching branches", async () => {
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "rules",
            type: "apply_rules",
            rules: [
              {
                condition: { field: "channelType", op: "eq", value: "messenger" },
                nextId: "msg-a",
              },
              {
                condition: { field: "priority", op: "eq", value: "normal" },
                nextId: "msg-b",
              },
            ],
          },
          { id: "msg-a", type: "send_message", plainText: "Channel path" },
          { id: "msg-b", type: "send_message", plainText: "Priority path" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
      {
        workflowId: "wf-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
        facts: { channelType: "messenger", priority: "normal" },
      },
    );

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(result.steps.some((s) => s.type === "apply_rules" && s.status === "ok")).toBe(true);
    expect(result.steps.filter((s) => s.type === "send_message")).toHaveLength(2);
  });

  it("runs link_ticket block", async () => {
    const linkTicket = vi.fn(async () => ({
      parentTicketId: "parent-1",
      childTicketId: "child-2",
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "link-1",
            type: "link_ticket",
            parentTicketId: "parent-1",
            childTicketId: "child-2",
            linkType: "tracks",
          },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        linkTicket,
      },
    );

    expect(linkTicket).toHaveBeenCalledWith({
      parentTicketId: "parent-1",
      childTicketId: "child-2",
      linkType: "tracks",
    });
    expect(result.steps[0]?.output).toMatchObject({
      parentTicketId: "parent-1",
      childTicketId: "child-2",
    });
  });

  it("runs send_ticket_update block", async () => {
    const sendTicketUpdate = vi.fn(async () => ({ sent: true }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "notify-1", type: "send_ticket_update", ticketId: "ticket-42" }],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        sendTicketUpdate,
      },
    );

    expect(sendTicketUpdate).toHaveBeenCalledWith({ ticketId: "ticket-42" });
    expect(result.steps[0]?.output).toMatchObject({ notificationSent: true });
  });

  it("runs wait and http_request blocks", async () => {
    const wait = vi.fn(async () => {});
    const httpRequest = vi.fn(async () => ({ status: 204, body: "" }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          { id: "w1", type: "wait", seconds: 2 },
          {
            id: "h1",
            type: "http_request",
            method: "POST",
            url: "https://example.com/hook",
            body: "{}",
          },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        wait,
        httpRequest,
      },
    );

    expect(wait).toHaveBeenCalledWith(2000);
    expect(httpRequest).toHaveBeenCalledWith({
      method: "POST",
      url: "https://example.com/hook",
      body: "{}",
    });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.output).toMatchObject({ waitMs: 2000 });
    expect(result.steps[1]?.output).toMatchObject({ httpStatus: 204 });
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

  it("suspends on collect_data until input is submitted", async () => {
    const collectData = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {});

    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [
        {
          id: "collect",
          type: "collect_data",
          prompt: "Email?",
          allowFreeText: false,
          fields: [{ key: "email", label: "Email", required: true }],
        },
        { id: "thanks", type: "send_message", plainText: "Thanks!" },
      ],
    };

    const result = await runWorkflow(
      definition,
      { sendMessage, assign: vi.fn(), close: vi.fn(), collectData },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
    );

    expect(collectData).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.suspended).toEqual({ blockId: "collect", type: "collect_data" });
    expect(result.steps.at(-1)?.output?.awaitingInput).toBe(true);
  });

  it("resumes collect_data workflow from the next block", async () => {
    const sendMessage = vi.fn(async () => {});

    const definition: WorkflowDefinition = {
      trigger: "first_message",
      blocks: [
        {
          id: "collect",
          type: "collect_data",
          prompt: "Email?",
          allowFreeText: false,
          fields: [{ key: "email", label: "Email", required: true }],
        },
        { id: "thanks", type: "send_message", plainText: "Thanks!" },
      ],
    };

    const initialSteps = [
      {
        blockId: "collect",
        type: "collect_data" as const,
        status: "ok" as const,
        output: {
          awaitingInput: false,
          submittedAttributes: { email: "user@test.local" },
        },
      },
    ];

    const result = await runWorkflow(
      definition,
      { sendMessage, assign: vi.fn(), close: vi.fn() },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      { startBlockId: "thanks", initialSteps },
    );

    expect(sendMessage).toHaveBeenCalledWith({ plainText: "Thanks!", attachmentIds: undefined });
    expect(result.suspended).toBeUndefined();
    expect(result.steps).toHaveLength(2);
  });

  it("suspends on reply_buttons until a button is clicked", async () => {
    const replyButtons = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "buttons",
            type: "reply_buttons",
            prompt: "Pick one",
            allowFreeText: false,
            buttons: [
              { id: "yes", label: "Yes", nextId: "yes-path" },
              { id: "no", label: "No", nextId: "no-path" },
            ],
          },
          { id: "yes-path", type: "send_message", plainText: "Great!" },
          { id: "no-path", type: "send_message", plainText: "Sorry!" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn(), replyButtons },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
    );

    expect(replyButtons).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.suspended).toEqual({ blockId: "buttons", type: "reply_buttons" });
  });

  it("resumes reply_buttons workflow on the selected button path", async () => {
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "buttons",
            type: "reply_buttons",
            prompt: "Pick one",
            allowFreeText: false,
            buttons: [{ id: "yes", label: "Yes", nextId: "yes-path" }],
          },
          { id: "yes-path", type: "send_message", plainText: "Great!" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      {
        startBlockId: "yes-path",
        initialSteps: [
          {
            blockId: "buttons",
            type: "reply_buttons",
            status: "ok",
            output: {
              awaitingInput: false,
              buttonId: "yes",
              buttonLabel: "Yes",
              nextBlockId: "yes-path",
            },
          },
        ],
      },
    );

    expect(sendMessage).toHaveBeenCalledWith({ plainText: "Great!", attachmentIds: undefined });
    expect(result.suspended).toBeUndefined();
  });

  it("snoozes conversation via snooze block", async () => {
    const snooze = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "snooze", type: "snooze", minutes: 30 }],
      },
      { sendMessage: vi.fn(), assign: vi.fn(), close: vi.fn(), snooze },
    );

    expect(snooze).toHaveBeenCalledWith({ minutes: 30 });
    expect(result.steps[0]?.output?.snoozeMinutes).toBe(30);
  });

  it("suspends csat workflow when waitForRating is enabled", async () => {
    const csat = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "csat",
            type: "csat",
            prompt: "Rate us",
            allowComment: true,
            waitForRating: true,
          },
        ],
      },
      { sendMessage: vi.fn(), assign: vi.fn(), close: vi.fn(), csat },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
    );

    expect(csat).toHaveBeenCalledOnce();
    expect(result.suspended).toEqual({ blockId: "csat", type: "csat" });
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
