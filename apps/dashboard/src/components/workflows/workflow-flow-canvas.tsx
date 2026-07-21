"use client";

import type { WorkflowBlock, WorkflowDefinition } from "@/lib/api";
import { cn } from "@keenai/ui";
import {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileInput,
  GitBranch,
  LayoutGrid,
  Maximize2,
  MessageSquareText,
  Minus,
  Plus,
  Redo2,
  Send,
  Tag,
  Ticket,
  Undo2,
  UserCheck,
  Zap,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  blockCategory,
  blockLabel,
  collectWorkflowEdges,
  layoutWorkflowNodes,
  triggerLabel,
  workflowNodeSize,
} from "./workflow-graph";

type BlockNodeData = {
  block: WorkflowBlock;
  selected: boolean;
  executed: boolean;
  failed: boolean;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
};

type TriggerNodeData = {
  trigger: WorkflowDefinition["trigger"];
  selected: boolean;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
};

type ManualPositionMap = Record<string, { x: number; y: number }>;

export type WorkflowCanvasInsertAnchor =
  | { kind: "trigger" }
  | { kind: "block"; blockId: string }
  | { kind: "branch"; blockId: string; branchIndex: number }
  | { kind: "branch_else"; blockId: string }
  | { kind: "rule"; blockId: string; ruleIndex: number }
  | { kind: "button"; blockId: string; buttonId: string }
  | { kind: "outcome"; blockId: string; outcome: "resolved" | "unresolved" | "escalated" };

function insertAnchorKey(anchor: WorkflowCanvasInsertAnchor): string {
  switch (anchor.kind) {
    case "trigger":
      return "trigger";
    case "block":
      return `block:${anchor.blockId}`;
    case "branch":
      return `branch:${anchor.blockId}:${anchor.branchIndex}`;
    case "branch_else":
      return `branch_else:${anchor.blockId}`;
    case "rule":
      return `rule:${anchor.blockId}:${anchor.ruleIndex}`;
    case "button":
      return `button:${anchor.blockId}:${anchor.buttonId}`;
    case "outcome":
      return `outcome:${anchor.blockId}:${anchor.outcome}`;
  }
}

function sameInsertAnchor(
  left: WorkflowCanvasInsertAnchor | null,
  right: WorkflowCanvasInsertAnchor,
) {
  if (!left) return false;
  return insertAnchorKey(left) === insertAnchorKey(right);
}

const categoryStyles: Record<
  ReturnType<typeof blockCategory> | "trigger",
  { border: string; badge: string; wash: string; icon: string }
> = {
  trigger: {
    border: "border-violet-500/60",
    badge: "text-violet-400",
    wash: "bg-violet-500/10",
    icon: "text-violet-400",
  },
  message: {
    border: "border-violet-500/55",
    badge: "text-violet-300",
    wash: "bg-violet-500/10",
    icon: "text-violet-300",
  },
  condition: {
    border: "border-amber-500/50",
    badge: "text-amber-400",
    wash: "bg-amber-500/10",
    icon: "text-amber-400",
  },
  action: {
    border: "border-[hsl(var(--border))]",
    badge: "text-[hsl(var(--primary))]",
    wash: "bg-[hsl(var(--surface-2))]",
    icon: "text-[hsl(var(--primary))]",
  },
};

function WorkflowBlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const block = data.block;
  const category = blockCategory(block);
  const styles = categoryStyles[category];
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "block", blockId: block.id };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-2xl border bg-[hsl(var(--surface-1))] p-3 shadow-lg shadow-black/10 transition-shadow",
        styles.border,
        data.failed
          ? "ring-2 ring-red-500 ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : data.executed
            ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
            : data.selected
              ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
              : "",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-violet-500 !border-violet-300"
      />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full border border-white/10",
            styles.wash,
            styles.icon,
          )}
        >
          <BlockIcon block={block} />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[10px] font-semibold uppercase tracking-wide", styles.badge)}>
            {block.type.replaceAll("_", " ")}
          </p>
          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
            {workflowBlockTitle(block)}
          </p>
        </div>
        {data.failed ? (
          <CircleAlert className="ml-auto size-4 text-red-400" />
        ) : data.executed ? (
          <CheckCircle2 className="ml-auto size-4 text-emerald-400" />
        ) : null}
      </div>

      <BlockPreview
        block={block}
        activeAddAnchor={data.activeAddAnchor}
        onOpenAddMenu={data.onOpenAddMenu}
        renderAddMenu={data.renderAddMenu}
      />

      <div className="mt-3 border-t border-[hsl(var(--border))] pt-3">
        <button
          type="button"
          className={cn(
            "nodrag nopan flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-100",
            addMenuOpen ? "border-violet-400/60 bg-violet-500/15 text-violet-100" : "",
          )}
          aria-label={`Add step after ${workflowBlockTitle(block)}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
          }}
        >
          <Plus className="size-3.5" />
          Add step
        </button>
      </div>

      <button
        type="button"
        className={cn(
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-300 shadow transition-colors group-hover:flex hover:bg-violet-500/15",
          addMenuOpen ? "flex" : "",
        )}
        aria-label={`Add action after ${workflowBlockTitle(block)}`}
        onClick={(event) => {
          event.stopPropagation();
          data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      {addMenuOpen && data.renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+1rem)] top-8 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {data.renderAddMenu(addAnchor)}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !border-violet-300"
      />
    </div>
  );
}

function WorkflowTriggerNode({ data }: NodeProps<Node<TriggerNodeData>>) {
  const styles = categoryStyles.trigger;
  const label = triggerLabel(data.trigger);
  const addAnchor: WorkflowCanvasInsertAnchor = { kind: "trigger" };
  const addMenuOpen = sameInsertAnchor(data.activeAddAnchor, addAnchor);

  return (
    <div
      className={cn(
        "group relative w-[320px] rounded-2xl border bg-[hsl(var(--surface-1))] p-3 shadow-lg shadow-black/10",
        styles.border,
        data.selected
          ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : "",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-300">
          <Zap className="size-4" />
        </span>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
            Trigger action
          </p>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {triggerPreviewTitle(data.trigger)}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
          {triggerPreviewDescription(data.trigger)}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-medium text-violet-200">
            {label}
          </span>
          <span className="rounded-full bg-[hsl(var(--surface-1))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
            Canvas editable
          </span>
        </div>
      </div>
      <button
        type="button"
        className={cn(
          "nodrag nopan absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/60 bg-[hsl(var(--surface-0))] text-violet-300 shadow transition-colors hover:bg-violet-500/15",
          addMenuOpen ? "flex" : "group-hover:flex",
        )}
        aria-label="Add first workflow action"
        onClick={(event) => {
          event.stopPropagation();
          data.onOpenAddMenu(addMenuOpen ? null : addAnchor);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      {addMenuOpen && data.renderAddMenu ? (
        <div
          className="nodrag nopan absolute left-[calc(100%+1rem)] top-8 z-50"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {data.renderAddMenu(addAnchor)}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !border-violet-300"
      />
    </div>
  );
}

function miniMapNodeColor(node: Node) {
  if (node.type === "workflowTrigger") return "hsl(270 88% 68%)";
  const data = node.data as Partial<BlockNodeData>;
  if (data.failed) return "hsl(0 84% 60%)";
  if (data.executed) return "hsl(160 84% 39%)";
  if (!data.block) return "hsl(252 80% 70%)";
  switch (blockCategory(data.block)) {
    case "condition":
      return "hsl(38 92% 50%)";
    case "message":
      return "hsl(260 84% 70%)";
    default:
      return "hsl(210 78% 58%)";
  }
}

function BlockIcon({ block }: { block: WorkflowBlock }) {
  switch (block.type) {
    case "send_message":
    case "show_expected_reply_time":
    case "reply_buttons":
    case "collect_customer_reply":
    case "disable_customer_reply":
      return <MessageSquareText className="size-4" />;
    case "let_keeni_answer":
      return <Bot className="size-4" />;
    case "collect_data":
    case "send_ticket_form":
      return <FileInput className="size-4" />;
    case "branches":
    case "apply_rules":
    case "goto":
      return <GitBranch className="size-4" />;
    case "wait":
    case "snooze":
      return <Clock3 className="size-4" />;
    case "assign":
      return <UserCheck className="size-4" />;
    case "convert_to_ticket":
    case "link_ticket":
    case "send_ticket_update":
    case "set_ticket_state":
      return <Ticket className="size-4" />;
    case "tag_conversation":
    case "tag_end_user":
      return <Tag className="size-4" />;
    default:
      return <Send className="size-4" />;
  }
}

function workflowBlockTitle(block: WorkflowBlock): string {
  switch (block.type) {
    case "let_keeni_answer":
      return "Let Keeni answer";
    case "send_message":
      return "Message";
    case "show_expected_reply_time":
      return "Show expected reply time";
    case "collect_data":
      return "Collect data";
    case "collect_customer_reply":
      return "Collect customer reply";
    case "reply_buttons":
      return "Reply buttons";
    case "csat":
      return "Ask for conversation rating";
    case "branches":
      return "Branches";
    case "apply_rules":
      return "Apply rules";
    default:
      return block.type.replaceAll("_", " ");
  }
}

function BlockPreview({
  block,
  activeAddAnchor,
  onOpenAddMenu,
  renderAddMenu,
}: {
  block: WorkflowBlock;
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  if (block.type === "send_message") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Content
        </p>
        <p className="line-clamp-4 min-h-[56px] whitespace-pre-wrap rounded-lg bg-[hsl(var(--surface-0))] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
          {block.plainText?.trim() || "Write a message for the customer..."}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 font-semibold">
            B
          </span>
          <span className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 italic">I</span>
          <span className="ml-auto">{block.attachmentIds?.length ?? 0} attachments</span>
        </div>
      </div>
    );
  }

  if (block.type === "let_keeni_answer") {
    const outcomeRouting = block.outcomeRouting;
    return (
      <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-0))] px-3 py-2">
          <Bot className="size-4 text-violet-300" />
          <p className="text-xs font-medium text-[hsl(var(--foreground))]">
            Auto answer with brand memory and knowledge base.
          </p>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
          {block.instructions?.trim() || `Max ${block.maxSteps ?? 8} agent steps.`}
        </p>
        <RouteOutputs
          routes={[
            {
              label: "Resolved",
              anchor: { kind: "outcome", blockId: block.id, outcome: "resolved" },
              connected: Boolean(outcomeRouting?.resolvedNext),
            },
            {
              label: "Unresolved",
              anchor: { kind: "outcome", blockId: block.id, outcome: "unresolved" },
              connected: Boolean(outcomeRouting?.unresolvedNext),
            },
            {
              label: "Escalated",
              anchor: { kind: "outcome", blockId: block.id, outcome: "escalated" },
              connected: Boolean(outcomeRouting?.escalatedNext),
            },
          ]}
          activeAddAnchor={activeAddAnchor}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  if (block.type === "reply_buttons") {
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="line-clamp-2 text-xs text-[hsl(var(--foreground))]">{block.prompt}</p>
        <RouteOutputs
          routes={block.buttons.slice(0, 4).map((button) => ({
            label: button.label,
            anchor: { kind: "button", blockId: block.id, buttonId: button.id },
            connected: Boolean(button.nextId),
          }))}
          activeAddAnchor={activeAddAnchor}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  if (block.type === "branches" || block.type === "apply_rules") {
    const routes =
      block.type === "branches"
        ? [
            ...block.branches.map((branch, index) => ({
              label: branch.label || `Branch ${index + 1}`,
              anchor: { kind: "branch" as const, blockId: block.id, branchIndex: index },
              connected: Boolean(branch.nextId),
            })),
            {
              label: "Else",
              anchor: { kind: "branch_else" as const, blockId: block.id },
              connected: Boolean(block.elseNextId),
            },
          ]
        : block.rules.map((rule, index) => ({
            label: rule.label || `Rule ${index + 1}`,
            anchor: { kind: "rule" as const, blockId: block.id, ruleIndex: index },
            connected: Boolean(rule.nextId),
          }));
    return (
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs text-[hsl(var(--foreground))]">{blockLabel(block)}</p>
        <RouteOutputs
          routes={routes.slice(0, 4)}
          activeAddAnchor={activeAddAnchor}
          onOpenAddMenu={onOpenAddMenu}
          renderAddMenu={renderAddMenu}
        />
      </div>
    );
  }

  if (block.type === "collect_data" || block.type === "send_ticket_form") {
    const fields = block.fields.map((field) => field.label);
    return (
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
        <p className="line-clamp-2 text-xs text-[hsl(var(--foreground))]">
          {block.type === "collect_data" ? block.prompt : block.title || block.prompt}
        </p>
        <div className="mt-3 grid gap-1.5">
          {fields.slice(0, 3).map((field) => (
            <span
              key={field}
              className="rounded-md bg-[hsl(var(--surface-0))] px-2 py-1 text-[11px] text-[hsl(var(--muted-foreground))]"
            >
              {field}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3">
      <p className="line-clamp-3 min-h-[44px] text-xs text-[hsl(var(--foreground))]">
        {blockLabel(block)}
      </p>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        Click card to edit settings
      </p>
    </div>
  );
}

function RouteOutputs({
  routes,
  activeAddAnchor,
  onOpenAddMenu,
  renderAddMenu,
}: {
  routes: {
    label: string;
    anchor: WorkflowCanvasInsertAnchor;
    connected: boolean;
  }[];
  activeAddAnchor: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
}) {
  return (
    <div className="mt-3 grid gap-1.5">
      {routes.map((route) => {
        const open = sameInsertAnchor(activeAddAnchor, route.anchor);
        return (
          <div key={insertAnchorKey(route.anchor)} className="relative">
            <button
              type="button"
              className={cn(
                "nodrag nopan flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors",
                route.connected
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : "border-violet-400/30 bg-[hsl(var(--surface-0))] text-violet-100 hover:bg-violet-500/15",
                open ? "border-violet-300 bg-violet-500/20" : "",
              )}
              aria-label={`Add action for ${route.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAddMenu(open ? null : route.anchor);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{route.label}</span>
              {route.connected ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <Plus className="size-3.5 shrink-0" />
              )}
            </button>
            {open && renderAddMenu ? (
              <div
                className="nodrag nopan absolute left-[calc(100%+0.75rem)] top-0 z-50"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderAddMenu(route.anchor)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function triggerPreviewTitle(trigger: WorkflowDefinition["trigger"]): string {
  switch (trigger) {
    case "page_view":
      return "Customer visits a page";
    case "new_messenger_conversation":
      return "New messenger conversation";
    case "first_message":
      return "Customer opens a new conversation";
    case "any_message":
      return "Any message is received";
    case "teammate_message":
      return "Teammate sends a message";
    case "conversation_state_changed":
      return "Conversation state changes";
    case "assigned_to_team":
      return "Conversation assigned to team";
    case "assigned_to_member":
      return "Conversation assigned to member";
    case "customer_unresponsive":
      return "Customer becomes unresponsive";
    case "teammate_unresponsive":
      return "Teammate becomes unresponsive";
    case "teammate_added_note":
      return "Teammate adds a note";
    case "ticket_created":
      return "Ticket is created";
    case "ticket_state_changed":
      return "Ticket state changes";
    case "schedule":
      return "Scheduled workflow";
    case "webhook":
      return "Incoming webhook";
    case "event_match":
      return "Custom event matches";
  }
}

function triggerPreviewDescription(trigger: WorkflowDefinition["trigger"]): string {
  switch (trigger) {
    case "page_view":
      return "Runs when a customer page-view event matches URL rules.";
    case "new_messenger_conversation":
      return "Runs when a customer starts a new messenger conversation.";
    case "first_message":
      return "Starts when the first customer message creates a conversation.";
    case "any_message":
      return "Runs whenever a customer or teammate message matches the trigger.";
    case "teammate_message":
      return "Runs when a teammate replies in the conversation.";
    case "conversation_state_changed":
      return "Runs when the conversation changes open, closed, or snoozed state.";
    case "assigned_to_team":
      return "Runs when the conversation is assigned to a team.";
    case "assigned_to_member":
      return "Runs when the conversation is assigned to a teammate.";
    case "customer_unresponsive":
      return "Starts after the configured inactivity window following an agent reply.";
    case "teammate_unresponsive":
      return "Runs after the configured inactivity window following a customer message.";
    case "teammate_added_note":
      return "Runs when a teammate adds an internal note.";
    case "ticket_created":
      return "Runs when a ticket is created from a conversation or form.";
    case "ticket_state_changed":
      return "Runs when a ticket moves between workflow states.";
    case "schedule":
      return "Runs on a cron schedule against the configured audience.";
    case "webhook":
      return "Runs when an external system posts to this workflow.";
    case "event_match":
      return "Runs when an incoming product event name matches this trigger.";
  }
}

function PurpleWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: "hsl(262 83% 58%)",
          strokeWidth: data?.kind === "branch" || data?.kind === "outcome" ? 2 : 1.5,
        }}
      />
      {label ? (
        <text
          x={labelX}
          y={labelY}
          className="fill-[hsl(var(--muted-foreground))] text-[10px]"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      ) : null}
    </>
  );
}

const nodeTypes = {
  workflowBlock: WorkflowBlockNode,
  workflowTrigger: WorkflowTriggerNode,
};

const edgeTypes = {
  purple: PurpleWorkflowEdge,
};

function definitionToFlow(
  definition: WorkflowDefinition,
  selectedBlockId: string | null,
  triggerSelected: boolean,
  runHighlight: { executed: Set<string>; failed: Set<string> },
  activeAddAnchor: WorkflowCanvasInsertAnchor | null,
  onOpenAddMenu: (anchor: WorkflowCanvasInsertAnchor | null) => void,
  renderAddMenu: ((anchor: WorkflowCanvasInsertAnchor) => ReactNode) | undefined,
  manualPositions: ManualPositionMap,
): { nodes: Node[]; edges: Edge[] } {
  const graphEdges = collectWorkflowEdges(definition);
  const layoutInput = [
    {
      id: "__trigger__",
      width: workflowNodeSize.trigger.width,
      height: workflowNodeSize.trigger.height,
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      width: workflowNodeSize.block.width,
      height: workflowNodeSize.block.height,
    })),
  ];

  const positioned = layoutWorkflowNodes(layoutInput, graphEdges);

  const nodes: Node[] = [
    {
      id: "__trigger__",
      type: "workflowTrigger",
      position: manualPositions.__trigger__ ?? {
        x: positioned.find((n) => n.id === "__trigger__")?.x ?? 0,
        y: positioned.find((n) => n.id === "__trigger__")?.y ?? 0,
      },
      data: {
        trigger: definition.trigger,
        selected: triggerSelected,
        activeAddAnchor,
        onOpenAddMenu,
        renderAddMenu,
      },
      draggable: true,
      selectable: true,
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      type: "workflowBlock",
      position: manualPositions[block.id] ?? {
        x: positioned.find((n) => n.id === block.id)?.x ?? 0,
        y: positioned.find((n) => n.id === block.id)?.y ?? 0,
      },
      data: {
        block,
        selected: selectedBlockId === block.id,
        executed: runHighlight.executed.has(block.id),
        failed: runHighlight.failed.has(block.id),
        activeAddAnchor,
        onOpenAddMenu,
        renderAddMenu,
      },
      draggable: true,
    })),
  ];

  const edges: Edge[] = graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "purple",
    label: edge.label,
    animated: edge.kind === "branch" || edge.kind === "outcome",
    data: { kind: edge.kind },
  }));

  return { nodes, edges };
}

export function WorkflowFlowCanvas({
  definition,
  selectedBlockId,
  triggerSelected,
  runHighlight,
  onSelectBlock,
  onSelectTrigger,
  activeAddAnchor,
  onOpenAddMenu,
  renderAddMenu,
  toolbar,
  configurationPanel,
  runTracePanel,
  layoutStorageKey,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  definition: WorkflowDefinition;
  selectedBlockId: string | null;
  triggerSelected: boolean;
  runHighlight: { executed: Set<string>; failed: Set<string> };
  onSelectBlock: (blockId: string | null) => void;
  onSelectTrigger: () => void;
  activeAddAnchor?: WorkflowCanvasInsertAnchor | null;
  onOpenAddMenu?: (anchor: WorkflowCanvasInsertAnchor | null) => void;
  renderAddMenu?: (anchor: WorkflowCanvasInsertAnchor) => ReactNode;
  toolbar?: ReactNode;
  configurationPanel?: ReactNode;
  runTracePanel?: ReactNode;
  layoutStorageKey?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const nodeIds = useMemo(
    () => new Set(["__trigger__", ...definition.blocks.map((block) => block.id)]),
    [definition.blocks],
  );
  const [manualPositions, setManualPositions] = useState<ManualPositionMap>({});
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  useEffect(() => {
    setLayoutLoaded(false);
    if (!layoutStorageKey) {
      setManualPositions({});
      setLayoutLoaded(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(layoutStorageKey);
      setManualPositions(stored ? (JSON.parse(stored) as ManualPositionMap) : {});
    } catch {
      setManualPositions({});
    }
    setLayoutLoaded(true);
  }, [layoutStorageKey]);

  useEffect(() => {
    setManualPositions((positions) => {
      const next = Object.fromEntries(
        Object.entries(positions).filter(([nodeId]) => nodeIds.has(nodeId)),
      ) as ManualPositionMap;
      return Object.keys(next).length === Object.keys(positions).length ? positions : next;
    });
  }, [nodeIds]);

  useEffect(() => {
    if (!layoutStorageKey || !layoutLoaded) return;
    try {
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(manualPositions));
    } catch {
      // Ignore storage failures; the canvas remains usable for the current session.
    }
  }, [layoutLoaded, layoutStorageKey, manualPositions]);

  const resetLayout = useCallback(() => {
    setManualPositions({});
    if (layoutStorageKey) {
      try {
        window.localStorage.removeItem(layoutStorageKey);
      } catch {
        // Ignore storage failures; clearing in-memory positions is enough.
      }
    }
  }, [layoutStorageKey]);

  const { nodes, edges } = useMemo(
    () =>
      definitionToFlow(
        definition,
        selectedBlockId,
        triggerSelected,
        runHighlight,
        activeAddAnchor ?? null,
        onOpenAddMenu ?? (() => undefined),
        renderAddMenu,
        manualPositions,
      ),
    [
      definition,
      selectedBlockId,
      triggerSelected,
      runHighlight,
      activeAddAnchor,
      onOpenAddMenu,
      renderAddMenu,
      manualPositions,
    ],
  );
  const [flowNodes, setFlowNodes] = useState<Node[]>(nodes);

  useEffect(() => {
    setFlowNodes(nodes);
  }, [nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "position" }> =>
        change.type === "position" && Boolean(change.position),
    );
    if (positionChanges.length === 0) return;
    setManualPositions((positions) => {
      const next = { ...positions };
      for (const change of positionChanges) {
        if (change.position) next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[640px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] shadow-sm">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.id === "__trigger__") {
            onSelectTrigger();
            return;
          }
          onSelectBlock(node.id);
        }}
        onPaneClick={() => {
          onSelectBlock(null);
          onOpenAddMenu?.(null);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <CanvasViewportControls
          canUndo={canUndo ?? false}
          canRedo={canRedo ?? false}
          onUndo={onUndo}
          onRedo={onRedo}
          hasCustomLayout={Object.keys(manualPositions).length > 0}
          onResetLayout={resetLayout}
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={miniMapNodeColor}
          maskColor="hsl(var(--surface-0) / 0.55)"
          className="!m-4 !h-[128px] !w-[184px] !rounded-lg !border !border-[hsl(var(--border))] !bg-[hsl(var(--surface-1))] !shadow-xl"
        />
      </ReactFlow>
      <div className="pointer-events-none absolute inset-0 z-10">
        {toolbar ? (
          <div className="pointer-events-auto absolute left-4 top-4">{toolbar}</div>
        ) : null}
        {configurationPanel ? (
          <div className="pointer-events-auto absolute right-4 top-4 max-h-[calc(100%-2rem)] w-[360px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
            {configurationPanel}
          </div>
        ) : null}
        {runTracePanel ? (
          <div className="pointer-events-auto absolute bottom-[164px] right-4 max-h-[300px] w-[360px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl">
            {runTracePanel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CanvasViewportControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasCustomLayout,
  onResetLayout,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  hasCustomLayout: boolean;
  onResetLayout: () => void;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const controlClass =
    "flex size-9 items-center justify-center text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <Panel position="bottom-left" className="m-0">
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-xl shadow-black/10">
        <button
          type="button"
          className={controlClass}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo workflow change"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          aria-label="Redo workflow change"
        >
          <Redo2 className="size-4" />
        </button>
        <div className="h-px bg-[hsl(var(--border))]" />
        <button
          type="button"
          className={controlClass}
          onClick={onResetLayout}
          disabled={!hasCustomLayout}
          title="Auto layout"
          aria-label="Reset to automatic layout"
        >
          <LayoutGrid className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomIn({ duration: 180 })}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomOut({ duration: 180 })}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => fitView({ padding: 0.24, duration: 220 })}
          title="Fit view"
          aria-label="Fit view"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
    </Panel>
  );
}
