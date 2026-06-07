import type { WorkflowBlock, WorkflowDefinition, WorkflowRunStep } from "@/lib/api";
import dagre from "dagre";

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "linear" | "branch" | "outcome" | "trigger";
};

export type WorkflowNodeCategory = "trigger" | "message" | "condition" | "action";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;
const TRIGGER_WIDTH = 168;
const TRIGGER_HEIGHT = 56;

export function blockCategory(block: WorkflowBlock): WorkflowNodeCategory {
  switch (block.type) {
    case "send_message":
    case "let_keeni_answer":
    case "collect_data":
    case "reply_buttons":
      return "message";
    case "branches":
      return "condition";
    case "apply_rules":
      return "condition";
    default:
      return "action";
  }
}

export function collectWorkflowEdges(definition: WorkflowDefinition): WorkflowGraphEdge[] {
  const edges: WorkflowGraphEdge[] = [];
  const blockIds = new Set(definition.blocks.map((b) => b.id));
  const first = definition.blocks[0];

  if (first) {
    edges.push({
      id: "trigger-first",
      source: "__trigger__",
      target: first.id,
      label: definition.trigger.replace("_", " "),
      kind: "trigger",
    });
  }

  for (let index = 0; index < definition.blocks.length; index++) {
    const block = definition.blocks[index];
    if (!block) continue;
    const linearNext = definition.blocks[index + 1]?.id ?? null;

    if (block.type === "branches") {
      for (const [branchIndex, branch] of block.branches.entries()) {
        if (branch.nextId && blockIds.has(branch.nextId)) {
          edges.push({
            id: `${block.id}-branch-${branchIndex}`,
            source: block.id,
            target: branch.nextId,
            label: branch.label ?? `Branch ${branchIndex + 1}`,
            kind: "branch",
          });
        }
      }
      if (block.elseNextId && blockIds.has(block.elseNextId)) {
        edges.push({
          id: `${block.id}-else`,
          source: block.id,
          target: block.elseNextId,
          label: "Else",
          kind: "branch",
        });
      }
      continue;
    }

    if (block.type === "apply_rules") {
      for (const [ruleIndex, rule] of block.rules.entries()) {
        if (rule.nextId && blockIds.has(rule.nextId)) {
          edges.push({
            id: `${block.id}-rule-${ruleIndex}`,
            source: block.id,
            target: rule.nextId,
            label: rule.label ?? `Rule ${ruleIndex + 1}`,
            kind: "branch",
          });
        }
      }
      continue;
    }

    if (block.type === "reply_buttons") {
      for (const [buttonIndex, button] of block.buttons.entries()) {
        if (button.nextId && blockIds.has(button.nextId)) {
          edges.push({
            id: `${block.id}-button-${buttonIndex}`,
            source: block.id,
            target: button.nextId,
            label: button.label,
            kind: "branch",
          });
        }
      }
      continue;
    }

    if (block.type === "let_keeni_answer" && block.outcomeRouting) {
      const routes: { label: string; target: string | null }[] = [
        { label: "Resolved", target: block.outcomeRouting.resolvedNext },
        { label: "Unresolved", target: block.outcomeRouting.unresolvedNext },
        { label: "Escalated", target: block.outcomeRouting.escalatedNext },
      ];
      for (const route of routes) {
        if (route.target && blockIds.has(route.target)) {
          edges.push({
            id: `${block.id}-${route.label.toLowerCase()}`,
            source: block.id,
            target: route.target,
            label: route.label,
            kind: "outcome",
          });
        }
      }
      continue;
    }

    if (linearNext) {
      edges.push({
        id: `${block.id}-linear`,
        source: block.id,
        target: linearNext,
        kind: "linear",
      });
    }
  }

  return edges;
}

type LayoutNode = {
  id: string;
  width: number;
  height: number;
};

export type PositionedNode = LayoutNode & { x: number; y: number };

export function layoutWorkflowNodes(
  nodes: LayoutNode[],
  edges: WorkflowGraphEdge[],
): PositionedNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 96, marginx: 24, marginy: 24 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const positioned = graph.node(node.id) as { x: number; y: number };
    return {
      ...node,
      x: positioned.x - node.width / 2,
      y: positioned.y - node.height / 2,
    };
  });
}

export function blockLabel(block: WorkflowBlock): string {
  switch (block.type) {
    case "send_message": {
      const text = block.plainText?.trim();
      if (text) return text.length > 48 ? `${text.slice(0, 48)}…` : text;
      const count = block.attachmentIds?.length ?? 0;
      return count > 0 ? `${count} attachment(s)` : "(empty message)";
    }
    case "assign":
      return block.assigneeId ? `Assign → ${block.assigneeId}` : "Assign (unassigned)";
    case "close":
      return "Close conversation";
    case "let_keeni_answer":
      return block.instructions?.trim()
        ? block.instructions.length > 48
          ? `${block.instructions.slice(0, 48)}…`
          : block.instructions
        : `Keeni answer (max ${block.maxSteps ?? 8} steps)`;
    case "wait":
      return `Wait ${block.seconds}s`;
    case "http_request":
      return `${block.method} ${block.url.length > 40 ? `${block.url.slice(0, 40)}…` : block.url}`;
    case "branches":
      return `${block.branches.length} branch(es)`;
    case "apply_rules":
      return `${block.rules.length} rule(s) · all-match`;
    case "convert_to_ticket":
      return block.title?.trim() || "Convert conversation to ticket";
    case "link_ticket":
      return `Link → ${block.childTicketId.slice(0, 8)}… (${block.linkType})`;
    case "send_ticket_update":
      return block.ticketId
        ? `Notify ticket ${block.ticketId.slice(0, 8)}…`
        : "Notify conversation ticket";
    case "collect_data":
      return block.prompt.length > 48 ? `${block.prompt.slice(0, 48)}…` : block.prompt;
    case "reply_buttons":
      return `${block.buttons.length} button(s)`;
  }
}

export const workflowNodeSize = {
  block: { width: NODE_WIDTH, height: NODE_HEIGHT },
  trigger: { width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT },
};

export type WorkflowRunBlockHighlight = {
  executed: Set<string>;
  failed: Set<string>;
};

export function highlightBlocksFromRunSteps(steps: WorkflowRunStep[]): WorkflowRunBlockHighlight {
  const executed = new Set<string>();
  const failed = new Set<string>();
  for (const step of steps) {
    executed.add(step.blockId);
    if (step.status === "failed" || step.error) {
      failed.add(step.blockId);
    }
  }
  return { executed, failed };
}
