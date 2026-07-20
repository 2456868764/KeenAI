"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type Workflow,
  type WorkflowBlock,
  type WorkflowDefinition,
  getWorkflow,
  listWorkflowRuns,
  publishWorkflow,
  updateWorkflow,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { WorkflowBlockEditor } from "./workflow-block-editor";
import { WorkflowFlowCanvas } from "./workflow-flow-canvas";
import { highlightBlocksFromRunSteps } from "./workflow-graph";
import { WorkflowRunTrace } from "./workflow-run-trace";

function newBlockId() {
  return `block-${Date.now().toString(36)}`;
}

export function WorkflowEditorShell({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => getWorkflow(workflowId),
  });

  const { data: runsData } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => listWorkflowRuns(workflowId),
  });

  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [triggerPanelOpen, setTriggerPanelOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (data?.workflow) {
      setName(data.workflow.name);
      setDefinition(data.workflow.definition);
    }
  }, [data?.workflow]);

  const save = useMutation({
    mutationFn: () => {
      if (!definition) throw new Error("Missing definition");
      return updateWorkflow(workflowId, { name, definition });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const publish = useMutation({
    mutationFn: () => publishWorkflow(workflowId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const workflow = data?.workflow;
  const selectedBlock =
    definition && selectedBlockId
      ? (definition.blocks.find((b) => b.id === selectedBlockId) ?? null)
      : null;
  const selectedIndex =
    definition && selectedBlock
      ? definition.blocks.findIndex((b) => b.id === selectedBlock.id)
      : -1;

  const updateBlock = (next: WorkflowBlock) => {
    if (!definition || selectedIndex < 0) return;
    const blocks = [...definition.blocks];
    blocks[selectedIndex] = next;
    setDefinition({ ...definition, blocks });
  };

  const runs = runsData?.items ?? [];
  const runHighlight = useMemo(() => {
    const run = runs.find((item) => item.id === selectedRunId);
    return run
      ? highlightBlocksFromRunSteps(run.steps)
      : { executed: new Set<string>(), failed: new Set<string>() };
  }, [runs, selectedRunId]);

  const clearFlowSelection = () => {
    setSelectedBlockId(null);
    setTriggerPanelOpen(false);
  };

  const triggerFields = definition ? (
    <>
      <section className="space-y-2">
        <label
          htmlFor="workflow-trigger"
          className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
        >
          Trigger
        </label>
        <select
          id="workflow-trigger"
          value={definition.trigger}
          onChange={(e) => {
            const trigger = e.target.value as WorkflowDefinition["trigger"];
            setDefinition({
              ...definition,
              trigger,
              eventName: trigger === "event_match" ? (definition.eventName ?? "") : undefined,
              cron: trigger === "schedule" ? (definition.cron ?? "0 9 * * 1") : undefined,
            });
          }}
          className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
        >
          <option value="first_message">First customer message</option>
          <option value="customer_unresponsive">Customer unresponsive</option>
          <option value="schedule">Schedule</option>
          <option value="webhook">Webhook</option>
          <option value="event_match">Custom event</option>
        </select>
      </section>

      {definition.trigger === "customer_unresponsive" ? (
        <section className="space-y-2">
          <label
            htmlFor="workflow-inactivity"
            className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Inactivity (minutes after agent reply)
          </label>
          <Input
            id="workflow-inactivity"
            type="number"
            min={0}
            value={definition.inactivityMinutes ?? 30}
            onChange={(e) =>
              setDefinition({
                ...definition,
                inactivityMinutes: Number.parseInt(e.target.value, 10) || 0,
              })
            }
          />
        </section>
      ) : null}

      {definition.trigger === "event_match" ? (
        <section className="space-y-2">
          <label
            htmlFor="workflow-event-name"
            className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Event name
          </label>
          <Input
            id="workflow-event-name"
            value={definition.eventName ?? ""}
            placeholder="app/subscription.churned"
            onChange={(e) =>
              setDefinition({
                ...definition,
                eventName: e.target.value,
              })
            }
          />
        </section>
      ) : null}

      {definition.trigger === "schedule" ? (
        <section className="space-y-2">
          <label
            htmlFor="workflow-cron"
            className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Cron
          </label>
          <Input
            id="workflow-cron"
            value={definition.cron ?? ""}
            placeholder="0 9 * * 1"
            onChange={(e) =>
              setDefinition({
                ...definition,
                cron: e.target.value,
              })
            }
          />
        </section>
      ) : null}
    </>
  ) : null;

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Workflow editor">
        <Link
          href="/workflows"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← All workflows
        </Link>
        {workflow?.status === "draft" ? (
          <Button
            type="button"
            size="sm"
            disabled={publish.isPending || save.isPending}
            onClick={() => {
              save.mutate(undefined, {
                onSuccess: () => publish.mutate(),
              });
            }}
          >
            {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save & publish"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending || !definition}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </AppHeader>

      <main className="w-full flex-1 overflow-hidden p-4">
        {isLoading || !definition ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <WorkflowFlowCanvas
            definition={definition}
            selectedBlockId={selectedBlockId}
            triggerSelected={triggerPanelOpen}
            runHighlight={runHighlight}
            onSelectBlock={(blockId) => {
              setSelectedBlockId(blockId);
              setTriggerPanelOpen(false);
            }}
            onSelectTrigger={() => {
              setTriggerPanelOpen(true);
              setSelectedBlockId(null);
            }}
            toolbar={
              <CanvasToolbar
                workflow={workflow}
                name={name}
                onNameChange={setName}
                definition={definition}
                onAddBlock={(block) =>
                  setDefinition({ ...definition, blocks: [...definition.blocks, block] })
                }
              />
            }
            configurationPanel={
              selectedBlock && selectedIndex >= 0 ? (
                <CanvasConfigPanel
                  title={selectedBlock.type.replaceAll("_", " ")}
                  onClose={clearFlowSelection}
                >
                  <WorkflowBlockEditor
                    block={selectedBlock}
                    index={selectedIndex}
                    allBlocks={definition.blocks}
                    onChange={updateBlock}
                    onRemove={() => {
                      if (definition.blocks.length <= 1) return;
                      setDefinition({
                        ...definition,
                        blocks: definition.blocks.filter((b) => b.id !== selectedBlock.id),
                      });
                      setSelectedBlockId(null);
                    }}
                  />
                </CanvasConfigPanel>
              ) : triggerPanelOpen ? (
                <CanvasConfigPanel title="Trigger action" onClose={clearFlowSelection}>
                  <div className="space-y-4">{triggerFields}</div>
                </CanvasConfigPanel>
              ) : null
            }
            runTracePanel={
              selectedBlock || triggerPanelOpen ? undefined : (
                <WorkflowRunTrace
                  runs={runs}
                  selectedRunId={selectedRunId}
                  onSelectRun={setSelectedRunId}
                />
              )
            }
          />
        )}
      </main>
    </div>
  );
}

function CanvasToolbar({
  workflow,
  name,
  onNameChange,
  definition,
  onAddBlock,
}: {
  workflow: Workflow | undefined;
  name: string;
  onNameChange: (name: string) => void;
  definition: WorkflowDefinition;
  onAddBlock: (block: WorkflowBlock) => void;
}) {
  const changed =
    workflow?.publishedDefinition &&
    JSON.stringify(workflow.publishedDefinition) !== JSON.stringify(definition);

  return (
    <div className="w-[360px] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Workflow name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-9 font-semibold"
        />
        <BlockAddMenu onAdd={onAddBlock} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
        <span className="rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 capitalize">
          {workflow?.status ?? "draft"}
        </span>
        <span>
          {definition.blocks.length} step{definition.blocks.length === 1 ? "" : "s"}
        </span>
        {changed ? <span>Published snapshot differs from draft</span> : null}
        {workflow?.updatedAt ? (
          <span>Updated {new Date(workflow.updatedAt).toLocaleString()}</span>
        ) : null}
      </div>
    </div>
  );
}

function CanvasConfigPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex max-h-[calc(100vh-252px)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
            Canvas settings
          </p>
          <h2 className="text-sm font-semibold capitalize">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label="Close settings"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </section>
  );
}

function BlockAddMenu({ onAdd }: { onAdd: (block: WorkflowBlock) => void }) {
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const type = e.target.value;
        if (!type) return;
        e.target.value = "";
        const id = newBlockId();
        if (type === "send_message") {
          onAdd({ id, type: "send_message", plainText: "Hello!" });
        } else if (type === "show_expected_reply_time") {
          onAdd({ id, type: "show_expected_reply_time", fallbackMinutes: 240 });
        } else if (type === "add_note") {
          onAdd({ id, type: "add_note", plainText: "Internal note" });
        } else if (type === "mark_priority") {
          onAdd({ id, type: "mark_priority", priority: "high" });
        } else if (type === "assign") {
          onAdd({ id, type: "assign", assigneeId: null, teamId: null, strategy: "direct" });
        } else if (type === "close") {
          onAdd({ id, type: "close" });
        } else if (type === "reopen") {
          onAdd({ id, type: "reopen" });
        } else if (type === "end") {
          onAdd({ id, type: "end" });
        } else if (type === "goto") {
          onAdd({ id, type: "goto", targetBlockId: "" });
        } else if (type === "let_keeni_answer") {
          onAdd({ id, type: "let_keeni_answer", maxSteps: 8, instructions: "" });
        } else if (type === "wait") {
          onAdd({ id, type: "wait", seconds: 60 });
        } else if (type === "http_request") {
          onAdd({ id, type: "http_request", method: "GET", url: "https://example.com/hook" });
        } else if (type === "webhook_emit") {
          onAdd({
            id,
            type: "webhook_emit",
            url: "https://example.com/webhook",
            eventName: "workflow.event",
            payload: "{}",
          });
        } else if (type === "mcp_call") {
          onAdd({
            id,
            type: "mcp_call",
            serverId: "stub",
            toolName: "echo",
            arguments: { message: "hello" },
          });
        } else if (type === "script") {
          onAdd({
            id,
            type: "script",
            code: 'return { channel: facts.channelType, priority: facts.priority ?? "normal" };',
            timeoutMs: 2000,
            memoryMb: 32,
          });
        } else if (type === "branches") {
          onAdd({
            id,
            type: "branches",
            branches: [
              {
                label: "Email channel",
                condition: { field: "channelType", op: "eq", value: "email" },
                nextId: null,
              },
              { label: "Default", nextId: null },
            ],
          });
        } else if (type === "apply_rules") {
          onAdd({
            id,
            type: "apply_rules",
            rules: [
              {
                label: "Messenger",
                condition: { field: "channelType", op: "eq", value: "messenger" },
                nextId: `next-${id}`,
              },
            ],
          });
        } else if (type === "apply_sla") {
          onAdd({ id, type: "apply_sla" });
        } else if (type === "convert_to_ticket") {
          onAdd({ id, type: "convert_to_ticket", title: "" });
        } else if (type === "link_ticket") {
          onAdd({
            id,
            type: "link_ticket",
            childTicketId: "",
            linkType: "tracks",
          });
        } else if (type === "send_ticket_update") {
          onAdd({ id, type: "send_ticket_update" });
        } else if (type === "send_ticket_form") {
          onAdd({
            id,
            type: "send_ticket_form",
            prompt: "Please share the details we need for this ticket.",
            fields: [{ key: "impact", label: "Impact", type: "text", required: true }],
          });
        } else if (type === "collect_data") {
          onAdd({
            id,
            type: "collect_data",
            prompt: "What is your email?",
            allowFreeText: false,
            fields: [{ key: "email", label: "Email", required: true }],
          });
        } else if (type === "collect_customer_reply") {
          onAdd({
            id,
            type: "collect_customer_reply",
            prompt: "Reply here when you are ready.",
            bufferSeconds: 2,
          });
        } else if (type === "reply_buttons") {
          onAdd({
            id,
            type: "reply_buttons",
            prompt: "How can we help?",
            allowFreeText: false,
            buttons: [
              { id: "sales", label: "Sales", nextId: null },
              { id: "support", label: "Support", nextId: null },
            ],
          });
        } else if (type === "disable_customer_reply") {
          onAdd({ id, type: "disable_customer_reply", disabled: true });
        } else if (type === "snooze") {
          onAdd({ id, type: "snooze", minutes: 60 });
        } else if (type === "tag_end_user") {
          onAdd({ id, type: "tag_end_user", tags: ["vip"], mode: "append" });
        } else if (type === "tag_conversation") {
          onAdd({ id, type: "tag_conversation", tags: ["vip"], mode: "append" });
        } else if (type === "set_ticket_state") {
          onAdd({ id, type: "set_ticket_state", statusName: "Done" });
        } else if (type === "csat") {
          onAdd({
            id,
            type: "csat",
            prompt: "How would you rate this conversation?",
            allowComment: true,
            waitForRating: false,
          });
        }
      }}
      className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs"
    >
      <option value="">+ Add block</option>
      <option value="send_message">Send message</option>
      <option value="show_expected_reply_time">Show expected reply time</option>
      <option value="add_note">Add internal note</option>
      <option value="mark_priority">Mark priority</option>
      <option value="assign">Assign</option>
      <option value="close">Close conversation</option>
      <option value="reopen">Reopen conversation</option>
      <option value="end">End path</option>
      <option value="goto">Go to block</option>
      <option value="let_keeni_answer">Let Keeni answer</option>
      <option value="wait">Wait</option>
      <option value="http_request">HTTP request</option>
      <option value="webhook_emit">Emit webhook</option>
      <option value="mcp_call">MCP call</option>
      <option value="script">Script</option>
      <option value="branches">Branches</option>
      <option value="apply_rules">Apply rules (all-match)</option>
      <option value="apply_sla">Apply SLA</option>
      <option value="convert_to_ticket">Convert to ticket</option>
      <option value="link_ticket">Link tickets</option>
      <option value="send_ticket_form">Send ticket form</option>
      <option value="send_ticket_update">Send ticket update email</option>
      <option value="set_ticket_state">Set ticket state</option>
      <option value="collect_data">Collect data (suspend)</option>
      <option value="collect_customer_reply">Collect customer reply (suspend)</option>
      <option value="reply_buttons">Reply buttons (suspend)</option>
      <option value="disable_customer_reply">Disable customer reply</option>
      <option value="snooze">Snooze conversation</option>
      <option value="tag_end_user">Tag end user</option>
      <option value="tag_conversation">Tag conversation</option>
      <option value="csat">CSAT rating</option>
    </select>
  );
}
