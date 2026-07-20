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
import { Button, Input, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Braces,
  ChevronDown,
  Clock3,
  FileInput,
  GitBranch,
  Globe2,
  Loader2,
  MessageSquareText,
  PencilLine,
  Plus,
  Send,
  Star,
  Tag,
  Ticket,
  UserCheck,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { WorkflowBlockEditor } from "./workflow-block-editor";
import { type WorkflowCanvasInsertAnchor, WorkflowFlowCanvas } from "./workflow-flow-canvas";
import { highlightBlocksFromRunSteps } from "./workflow-graph";
import { WorkflowRunTrace } from "./workflow-run-trace";

function newBlockId() {
  return `block-${Date.now().toString(36)}`;
}

const TRIGGER_OPTIONS: { value: WorkflowDefinition["trigger"]; label: string }[] = [
  { value: "page_view", label: "Page view" },
  { value: "new_messenger_conversation", label: "New messenger conversation" },
  { value: "first_message", label: "First customer message" },
  { value: "any_message", label: "Any message" },
  { value: "teammate_message", label: "Teammate message" },
  { value: "conversation_state_changed", label: "Conversation state changed" },
  { value: "assigned_to_team", label: "Assigned to team" },
  { value: "assigned_to_member", label: "Assigned to member" },
  { value: "customer_unresponsive", label: "Customer unresponsive" },
  { value: "teammate_unresponsive", label: "Teammate unresponsive" },
  { value: "teammate_added_note", label: "Teammate added note" },
  { value: "ticket_created", label: "Ticket created" },
  { value: "ticket_state_changed", label: "Ticket state changed" },
  { value: "schedule", label: "Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "event_match", label: "Custom event" },
];

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
  const [addAnchor, setAddAnchor] = useState<WorkflowCanvasInsertAnchor | null>(null);

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

  const insertBlock = (block: WorkflowBlock, anchor?: WorkflowCanvasInsertAnchor | null) => {
    if (!definition) return;
    const blocks = [...definition.blocks];
    if (anchor?.kind === "trigger") {
      blocks.splice(0, 0, block);
    } else if (anchor?.kind === "block") {
      const index = blocks.findIndex((item) => item.id === anchor.blockId);
      blocks.splice(index >= 0 ? index + 1 : blocks.length, 0, block);
    } else {
      blocks.push(block);
    }
    setDefinition({ ...definition, blocks });
    setSelectedBlockId(block.id);
    setTriggerPanelOpen(false);
    setAddAnchor(null);
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
    setAddAnchor(null);
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
          {TRIGGER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      {definition.trigger === "customer_unresponsive" ||
      definition.trigger === "teammate_unresponsive" ? (
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
              setAddAnchor(null);
            }}
            onSelectTrigger={() => {
              setTriggerPanelOpen(true);
              setSelectedBlockId(null);
              setAddAnchor(null);
            }}
            activeAddAnchor={addAnchor}
            onOpenAddMenu={(anchor) => {
              setAddAnchor(anchor);
              setSelectedBlockId(null);
              setTriggerPanelOpen(false);
            }}
            renderAddMenu={(anchor) => (
              <WorkflowActionMenu
                title={anchor.kind === "trigger" ? "Add first action" : "Insert action"}
                description={
                  anchor.kind === "trigger"
                    ? "Choose the first workflow component after the trigger."
                    : "Choose a workflow component to insert after this step."
                }
                onAdd={(block) => insertBlock(block, anchor)}
              />
            )}
            toolbar={
              <CanvasToolbar
                workflow={workflow}
                name={name}
                onNameChange={setName}
                definition={definition}
                onAddBlock={(block) => insertBlock(block)}
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

type WorkflowBlockType = WorkflowBlock["type"];

type BlockAction = {
  type: WorkflowBlockType;
  label: string;
  description: string;
  icon: typeof Plus;
};

const ACTION_GROUPS: { title: string; items: BlockAction[] }[] = [
  {
    title: "Send",
    items: [
      {
        type: "let_keeni_answer",
        label: "Let Keeni answer",
        description: "Use the AI agent, memory, and KB to reply.",
        icon: Bot,
      },
      {
        type: "send_message",
        label: "Message",
        description: "Send a formatted customer message.",
        icon: MessageSquareText,
      },
      {
        type: "show_expected_reply_time",
        label: "Expected reply time",
        description: "Display the SLA reply-time estimate.",
        icon: Clock3,
      },
      {
        type: "disable_customer_reply",
        label: "Disable customer reply",
        description: "Toggle customer replies for this conversation.",
        icon: MessageSquareText,
      },
      {
        type: "send_ticket_update",
        label: "Send ticket update",
        description: "Notify the customer about ticket progress.",
        icon: Ticket,
      },
      {
        type: "send_ticket_form",
        label: "Send ticket form",
        description: "Collect ticket details through a form.",
        icon: FileInput,
      },
    ],
  },
  {
    title: "Collect",
    items: [
      {
        type: "collect_data",
        label: "Collect data",
        description: "Ask for structured fields and wait.",
        icon: FileInput,
      },
      {
        type: "collect_customer_reply",
        label: "Collect customer reply",
        description: "Suspend until the customer responds.",
        icon: MessageSquareText,
      },
      {
        type: "reply_buttons",
        label: "Reply buttons",
        description: "Offer button choices with routing.",
        icon: Send,
      },
      {
        type: "csat",
        label: "Ask for CSAT",
        description: "Request a conversation rating.",
        icon: Star,
      },
    ],
  },
  {
    title: "Internal",
    items: [
      {
        type: "assign",
        label: "Assign",
        description: "Assign directly, round-robin, or least-busy.",
        icon: UserCheck,
      },
      {
        type: "add_note",
        label: "Add note",
        description: "Leave an internal teammate note.",
        icon: PencilLine,
      },
      {
        type: "mark_priority",
        label: "Mark as priority",
        description: "Set low, normal, high, or urgent priority.",
        icon: Star,
      },
      {
        type: "tag_conversation",
        label: "Tag conversation",
        description: "Append or replace conversation tags.",
        icon: Tag,
      },
      {
        type: "tag_end_user",
        label: "Tag end user",
        description: "Append or replace customer tags.",
        icon: Tag,
      },
      {
        type: "set_ticket_state",
        label: "Set ticket state",
        description: "Move the linked ticket to a status.",
        icon: Ticket,
      },
      {
        type: "convert_to_ticket",
        label: "Convert to ticket",
        description: "Create a ticket from the conversation.",
        icon: Ticket,
      },
      {
        type: "link_ticket",
        label: "Link tickets",
        description: "Create parent, child, or tracking links.",
        icon: Ticket,
      },
      {
        type: "apply_sla",
        label: "Apply SLA",
        description: "Apply the active SLA policy.",
        icon: Clock3,
      },
      {
        type: "close",
        label: "Close conversation",
        description: "Close the conversation.",
        icon: X,
      },
      {
        type: "reopen",
        label: "Reopen conversation",
        description: "Reopen a closed or snoozed conversation.",
        icon: Plus,
      },
    ],
  },
  {
    title: "Delay",
    items: [
      {
        type: "snooze",
        label: "Snooze",
        description: "Snooze the conversation for a duration.",
        icon: Clock3,
      },
      {
        type: "wait",
        label: "Wait",
        description: "Pause the workflow before continuing.",
        icon: Clock3,
      },
    ],
  },
  {
    title: "Branch",
    items: [
      {
        type: "branches",
        label: "Branches",
        description: "Route to the first matching branch.",
        icon: GitBranch,
      },
      {
        type: "apply_rules",
        label: "Apply rules",
        description: "Run every matching rule branch.",
        icon: GitBranch,
      },
      {
        type: "goto",
        label: "Go to block",
        description: "Jump to another block.",
        icon: GitBranch,
      },
      {
        type: "end",
        label: "End path",
        description: "Stop this workflow path.",
        icon: X,
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        type: "http_request",
        label: "HTTP request",
        description: "Call an external HTTP endpoint.",
        icon: Globe2,
      },
      {
        type: "webhook_emit",
        label: "Emit webhook",
        description: "Send a workflow event to a webhook.",
        icon: Webhook,
      },
      {
        type: "mcp_call",
        label: "MCP call",
        description: "Call a configured MCP tool.",
        icon: Braces,
      },
      {
        type: "script",
        label: "Script",
        description: "Run a constrained JavaScript block.",
        icon: Braces,
      },
    ],
  },
];

function BlockAddMenu({ onAdd }: { onAdd: (block: WorkflowBlock) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--primary)/0.9)]"
      >
        <Plus className="size-3.5" />
        Add
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <WorkflowActionMenu
          className="absolute top-11 right-0 z-50"
          onAdd={(block) => {
            onAdd(block);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function WorkflowActionMenu({
  onAdd,
  title = "Add action",
  description = "Choose the next workflow component. Settings open on the canvas after selection.",
  className,
}: {
  onAdd: (block: WorkflowBlock) => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[560px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-2xl shadow-black/30",
        className,
      )}
    >
      <div className="border-b border-[hsl(var(--border))] px-4 py-3">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <div className="max-h-[520px] overflow-y-auto p-3">
        {ACTION_GROUPS.map((group) => (
          <section key={group.title} className="mb-4 last:mb-0">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              {group.title}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onAdd(createWorkflowBlock(item.type))}
                    className="flex min-h-[76px] items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3 text-left transition-colors hover:border-violet-400/60 hover:bg-violet-500/10"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[hsl(var(--foreground))]">
                        {item.label}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function createWorkflowBlock(type: WorkflowBlockType): WorkflowBlock {
  const id = newBlockId();
  switch (type) {
    case "send_message":
      return { id, type, plainText: "Hello!" };
    case "show_expected_reply_time":
      return { id, type, fallbackMinutes: 240 };
    case "add_note":
      return { id, type, plainText: "Internal note" };
    case "mark_priority":
      return { id, type, priority: "high" };
    case "assign":
      return { id, type, assigneeId: null, teamId: null, strategy: "direct" };
    case "close":
    case "reopen":
    case "end":
      return { id, type };
    case "goto":
      return { id, type, targetBlockId: "" };
    case "let_keeni_answer":
      return { id, type, maxSteps: 8, instructions: "" };
    case "wait":
      return { id, type, seconds: 60 };
    case "http_request":
      return { id, type, method: "GET", url: "https://example.com/hook" };
    case "webhook_emit":
      return {
        id,
        type,
        url: "https://example.com/webhook",
        eventName: "workflow.event",
        payload: "{}",
      };
    case "mcp_call":
      return {
        id,
        type,
        serverId: "stub",
        toolName: "echo",
        arguments: { message: "hello" },
      };
    case "script":
      return {
        id,
        type,
        code: 'return { channel: facts.channelType, priority: facts.priority ?? "normal" };',
        timeoutMs: 2000,
        memoryMb: 32,
      };
    case "branches":
      return {
        id,
        type,
        branches: [
          {
            label: "Email channel",
            condition: { field: "channelType", op: "eq", value: "email" },
            nextId: null,
          },
          { label: "Default", nextId: null },
        ],
      };
    case "apply_rules":
      return {
        id,
        type,
        rules: [
          {
            label: "Messenger",
            condition: { field: "channelType", op: "eq", value: "messenger" },
            nextId: `next-${id}`,
          },
        ],
      };
    case "apply_sla":
      return { id, type };
    case "convert_to_ticket":
      return { id, type, title: "" };
    case "link_ticket":
      return { id, type, childTicketId: "", linkType: "tracks" };
    case "send_ticket_update":
      return { id, type };
    case "send_ticket_form":
      return {
        id,
        type,
        prompt: "Please share the details we need for this ticket.",
        fields: [{ key: "impact", label: "Impact", type: "text", required: true }],
      };
    case "collect_data":
      return {
        id,
        type,
        prompt: "What is your email?",
        allowFreeText: false,
        fields: [{ key: "email", label: "Email", required: true }],
      };
    case "collect_customer_reply":
      return {
        id,
        type,
        prompt: "Reply here when you are ready.",
        bufferSeconds: 2,
      };
    case "reply_buttons":
      return {
        id,
        type,
        prompt: "How can we help?",
        allowFreeText: false,
        buttons: [
          { id: "sales", label: "Sales", nextId: null },
          { id: "support", label: "Support", nextId: null },
        ],
      };
    case "disable_customer_reply":
      return { id, type, disabled: true };
    case "snooze":
      return { id, type, minutes: 60 };
    case "tag_end_user":
      return { id, type, tags: ["vip"], mode: "append" };
    case "tag_conversation":
      return { id, type, tags: ["vip"], mode: "append" };
    case "set_ticket_state":
      return { id, type, statusName: "Done" };
    case "csat":
      return {
        id,
        type,
        prompt: "How would you rate this conversation?",
        allowComment: true,
        waitForRating: false,
      };
  }
}
