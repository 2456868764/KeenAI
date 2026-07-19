import { describe, expect, it, vi } from "vitest";
import { resolveLetKeeniAnswerNext } from "./blocks/let-keeni-answer.js";
import { runWorkflow } from "./executor.js";
import { type WorkflowDefinition, workflowDefinitionSchema } from "./schema.js";

describe("runWorkflow", () => {
  it("runs send_message, assign and close blocks in order", async () => {
    const sendMessage = vi.fn(async () => {});
    const assign = vi.fn(async () => undefined);
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
    expect(assign).toHaveBeenCalledWith({
      assigneeId: "member-1",
      teamId: null,
      strategy: "direct",
    });
    expect(close).toHaveBeenCalledOnce();
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.status === "ok")).toBe(true);
  });

  it("runs team assignment strategies with structured output", async () => {
    const assign = vi.fn(async () => ({
      assigneeId: "member-2",
      teamId: "team-1",
      strategy: "least_busy" as const,
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "assign", type: "assign", teamId: "team-1", strategy: "least_busy" }],
      },
      { sendMessage: vi.fn(), assign, close: vi.fn() },
    );

    expect(assign).toHaveBeenCalledWith({
      assigneeId: null,
      teamId: "team-1",
      strategy: "least_busy",
    });
    expect(result.steps[0]?.output).toMatchObject({
      assigneeId: "member-2",
      teamId: "team-1",
      assignStrategy: "least_busy",
    });
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

  it("runs show_expected_reply_time blocks through the reply time handler", async () => {
    const showExpectedReplyTime = vi.fn(async () => ({
      plainText: "We usually reply within 2 hours.",
      expectedReplyMinutes: 120,
      insideOfficeHours: true,
      policyId: "policy-1",
      policyName: "Standard",
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "reply-time",
            type: "show_expected_reply_time",
            policyId: "policy-1",
            fallbackMinutes: 240,
          },
        ],
      },
      { sendMessage: vi.fn(), showExpectedReplyTime, assign: vi.fn(), close: vi.fn() },
    );

    expect(showExpectedReplyTime).toHaveBeenCalledWith({
      policyId: "policy-1",
      fallbackMinutes: 240,
      insideOfficeHoursText: undefined,
      outsideOfficeHoursText: undefined,
    });
    expect(result.steps).toEqual([
      {
        blockId: "reply-time",
        type: "show_expected_reply_time",
        status: "ok",
        output: {
          replyText: "We usually reply within 2 hours.",
          expectedReplyMinutes: 120,
          insideOfficeHours: true,
          slaPolicyId: "policy-1",
          policyName: "Standard",
        },
      },
    ]);
  });

  it("runs add_note blocks through the note handler", async () => {
    const addNote = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "note", type: "add_note", plainText: "Investigate billing account." }],
      },
      { sendMessage: vi.fn(), addNote, assign: vi.fn(), close: vi.fn() },
    );

    expect(addNote).toHaveBeenCalledWith({ plainText: "Investigate billing account." });
    expect(result.steps).toEqual([{ blockId: "note", type: "add_note", status: "ok" }]);
  });

  it("runs mark_priority blocks through the priority handler", async () => {
    const markPriority = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "priority", type: "mark_priority", priority: "urgent" }],
      },
      { sendMessage: vi.fn(), markPriority, assign: vi.fn(), close: vi.fn() },
    );

    expect(markPriority).toHaveBeenCalledWith({ priority: "urgent" });
    expect(result.steps).toEqual([
      {
        blockId: "priority",
        type: "mark_priority",
        status: "ok",
        output: { priority: "urgent" },
      },
    ]);
  });

  it("runs disable_customer_reply blocks through the composer state handler", async () => {
    const disableCustomerReply = vi.fn(async () => ({
      disabled: true,
      reason: "Waiting for teammate review",
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "disable-reply",
            type: "disable_customer_reply",
            disabled: true,
            reason: "Waiting for teammate review",
          },
        ],
      },
      { sendMessage: vi.fn(), disableCustomerReply, assign: vi.fn(), close: vi.fn() },
    );

    expect(disableCustomerReply).toHaveBeenCalledWith({
      disabled: true,
      reason: "Waiting for teammate review",
    });
    expect(result.steps).toEqual([
      {
        blockId: "disable-reply",
        type: "disable_customer_reply",
        status: "ok",
        output: { customerReplyDisabled: true },
      },
    ]);
  });

  it("runs reopen blocks through the reopen handler", async () => {
    const reopen = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "reopen", type: "reopen" }],
      },
      { sendMessage: vi.fn(), reopen, assign: vi.fn(), close: vi.fn() },
    );

    expect(reopen).toHaveBeenCalledOnce();
    expect(result.steps).toEqual([{ blockId: "reopen", type: "reopen", status: "ok" }]);
  });

  it("ends the current path without running later linear blocks", async () => {
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          { id: "end", type: "end" },
          { id: "after", type: "send_message", plainText: "Should not run" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
    );

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.steps).toEqual([{ blockId: "end", type: "end", status: "ok" }]);
  });

  it("jumps to goto target blocks and skips the linear next block", async () => {
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          { id: "jump", type: "goto", targetBlockId: "target" },
          { id: "skipped", type: "send_message", plainText: "Should not run" },
          { id: "target", type: "send_message", plainText: "Reached target" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn() },
    );

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      plainText: "Reached target",
      attachmentIds: undefined,
    });
    expect(result.steps).toEqual([
      {
        blockId: "jump",
        type: "goto",
        status: "ok",
        output: { nextBlockId: "target" },
      },
      { blockId: "target", type: "send_message", status: "ok" },
    ]);
  });

  it("rejects goto blocks that target missing block ids", () => {
    const parsed = workflowDefinitionSchema.safeParse({
      trigger: "first_message",
      blocks: [{ id: "jump", type: "goto", targetBlockId: "missing" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("goto_target_not_found");
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

  it("runs apply_sla block", async () => {
    const applySla = vi.fn(async () => ({
      policyId: "policy-1",
      breachCount: 2,
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [{ id: "sla", type: "apply_sla", policyId: "policy-1" }],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        applySla,
      },
    );

    expect(applySla).toHaveBeenCalledWith({ policyId: "policy-1" });
    expect(result.steps[0]?.output).toMatchObject({
      slaPolicyId: "policy-1",
      slaBreachCount: 2,
    });
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

  it("runs set_ticket_state block", async () => {
    const setTicketState = vi.fn(async () => ({
      ticketId: "ticket-42",
      statusId: "status-done",
      statusName: "Done",
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "state-1",
            type: "set_ticket_state",
            ticketId: "ticket-42",
            statusName: "Done",
          },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        setTicketState,
      },
    );

    expect(setTicketState).toHaveBeenCalledWith({
      ticketId: "ticket-42",
      statusId: undefined,
      statusName: "Done",
    });
    expect(result.steps[0]?.output).toMatchObject({
      ticketId: "ticket-42",
      statusId: "status-done",
      statusName: "Done",
    });
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

  it("runs webhook_emit blocks", async () => {
    const webhookEmit = vi.fn(async () => ({
      status: 202,
      body: "accepted",
      eventName: "crm.customer.updated",
    }));

    const result = await runWorkflow(
      {
        trigger: "webhook",
        blocks: [
          {
            id: "hook",
            type: "webhook_emit",
            url: "https://example.com/crm",
            eventName: "crm.customer.updated",
            payload: '{"tier":"enterprise"}',
            headers: { Authorization: "Bearer test" },
          },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        webhookEmit,
      },
    );

    expect(webhookEmit).toHaveBeenCalledWith({
      blockId: "hook",
      url: "https://example.com/crm",
      eventName: "crm.customer.updated",
      payload: '{"tier":"enterprise"}',
      headers: { Authorization: "Bearer test" },
    });
    expect(result.steps[0]?.output).toMatchObject({
      httpStatus: 202,
      webhookEventName: "crm.customer.updated",
    });
  });

  it("runs mcp_call blocks through the MCP handler", async () => {
    const mcpCall = vi.fn(async () => ({
      serverId: "stub",
      toolName: "echo",
      result: "hello-mcp",
    }));

    const result = await runWorkflow(
      {
        trigger: "event_match",
        eventName: "app/subscription.churned",
        blocks: [
          {
            id: "mcp",
            type: "mcp_call",
            serverId: "stub",
            toolName: "echo",
            arguments: { message: "hello-mcp" },
          },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        mcpCall,
      },
    );

    expect(mcpCall).toHaveBeenCalledWith({
      serverId: "stub",
      toolName: "echo",
      arguments: { message: "hello-mcp" },
    });
    expect(result.steps[0]?.output).toMatchObject({
      mcpServerId: "stub",
      mcpToolName: "echo",
      mcpResultPreview: "hello-mcp",
    });
  });

  it("sends ticket forms and suspends until customer submission", async () => {
    const sendTicketForm = vi.fn(async () => ({ ticketId: "ticket-1" }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "ticket-form",
            type: "send_ticket_form",
            prompt: "Please add ticket details.",
            fields: [
              { key: "impact", label: "Impact", type: "text", required: true },
              {
                key: "severity",
                label: "Severity",
                type: "select",
                required: false,
                options: ["high"],
              },
            ],
          },
          { id: "after", type: "send_message", plainText: "Ticket updated." },
        ],
      },
      {
        sendMessage: vi.fn(),
        assign: vi.fn(),
        close: vi.fn(),
        sendTicketForm,
      },
      {
        workflowId: "workflow-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conversation-1",
      },
    );

    expect(sendTicketForm).toHaveBeenCalledWith({
      blockId: "ticket-form",
      prompt: "Please add ticket details.",
      title: undefined,
      ticketId: undefined,
      fields: [
        { key: "impact", label: "Impact", type: "text", required: true },
        {
          key: "severity",
          label: "Severity",
          type: "select",
          required: false,
          options: ["high"],
        },
      ],
      workflowRunId: "run-1",
      autoCloseMinutes: undefined,
    });
    expect(result.suspended).toEqual({ blockId: "ticket-form", type: "send_ticket_form" });
    expect(result.steps).toEqual([
      {
        blockId: "ticket-form",
        type: "send_ticket_form",
        status: "ok",
        output: { awaitingInput: true, ticketId: "ticket-1" },
      },
    ]);
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

  it("suspends on collect_customer_reply until the next customer message", async () => {
    const collectCustomerReply = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "wait-reply",
            type: "collect_customer_reply",
            prompt: "Please reply with the missing detail.",
            bufferSeconds: 2,
          },
          { id: "thanks", type: "send_message", plainText: "Thanks!" },
        ],
      },
      { sendMessage, assign: vi.fn(), close: vi.fn(), collectCustomerReply },
      {
        workflowId: "wf-1",
        workflowRunId: "run-1",
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
    );

    expect(collectCustomerReply).toHaveBeenCalledWith({
      blockId: "wait-reply",
      prompt: "Please reply with the missing detail.",
      workflowRunId: "run-1",
      bufferSeconds: 2,
      autoCloseMinutes: undefined,
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.suspended).toEqual({
      blockId: "wait-reply",
      type: "collect_customer_reply",
    });
    expect(result.steps.at(-1)?.output).toMatchObject({
      awaitingInput: true,
      bufferSeconds: 2,
    });
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

  it("tags conversation via tag_conversation block", async () => {
    const tagConversation = vi.fn(async () => {});

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "tag",
            type: "tag_conversation",
            tags: ["vip", "billing"],
            mode: "append",
          },
        ],
      },
      { sendMessage: vi.fn(), assign: vi.fn(), close: vi.fn(), tagConversation },
    );

    expect(tagConversation).toHaveBeenCalledWith({ tags: ["vip", "billing"], mode: "append" });
    expect(result.steps[0]?.output?.tags).toEqual(["vip", "billing"]);
  });

  it("tags end user via tag_end_user block", async () => {
    const tagEndUser = vi.fn(async () => ({
      targetCustomerId: "visitor-1",
      tags: ["vip"],
      taggedConversationCount: 2,
    }));

    const result = await runWorkflow(
      {
        trigger: "first_message",
        blocks: [
          {
            id: "tag-user",
            type: "tag_end_user",
            tags: ["vip"],
            mode: "append",
          },
        ],
      },
      { sendMessage: vi.fn(), assign: vi.fn(), close: vi.fn(), tagEndUser },
    );

    expect(tagEndUser).toHaveBeenCalledWith({ tags: ["vip"], mode: "append" });
    expect(result.steps[0]?.output).toMatchObject({
      tags: ["vip"],
      tagMode: "append",
      targetCustomerId: "visitor-1",
      taggedConversationCount: 2,
    });
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
