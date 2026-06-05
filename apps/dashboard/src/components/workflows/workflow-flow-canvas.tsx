"use client";

import type { WorkflowBlock, WorkflowDefinition } from "@/lib/api";
import {
  Background,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Zap } from "lucide-react";
import { useMemo } from "react";
import {
  blockCategory,
  blockLabel,
  collectWorkflowEdges,
  layoutWorkflowNodes,
  workflowNodeSize,
} from "./workflow-graph";

type BlockNodeData = {
  block: WorkflowBlock;
  selected: boolean;
};

type TriggerNodeData = {
  trigger: WorkflowDefinition["trigger"];
  selected: boolean;
};

const categoryStyles: Record<
  ReturnType<typeof blockCategory> | "trigger",
  { border: string; badge: string }
> = {
  trigger: {
    border: "border-violet-500/60",
    badge: "text-violet-400",
  },
  message: {
    border: "border-sky-500/50",
    badge: "text-sky-400",
  },
  condition: {
    border: "border-amber-500/50",
    badge: "text-amber-400",
  },
  action: {
    border: "border-[hsl(var(--border))]",
    badge: "text-[hsl(var(--primary))]",
  },
};

function WorkflowBlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const block = data.block;
  const category = blockCategory(block);
  const styles = categoryStyles[category];

  return (
    <div
      className={[
        "min-w-[180px] max-w-[220px] rounded-lg border bg-[hsl(var(--surface-1))] px-3 py-2 shadow-sm transition-shadow",
        styles.border,
        data.selected
          ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : "",
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-violet-500 !border-violet-300"
      />
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
        {block.type.replaceAll("_", " ")}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--foreground))]">{blockLabel(block)}</p>
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
  const label =
    data.trigger === "first_message" ? "First customer message" : "Customer unresponsive";

  return (
    <div
      className={[
        "flex min-w-[150px] items-center gap-2 rounded-lg border bg-[hsl(var(--surface-1))] px-3 py-2 shadow-sm",
        styles.border,
        data.selected
          ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface-2))]"
          : "",
      ].join(" ")}
    >
      <Zap className={`size-4 shrink-0 ${styles.badge}`} />
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
          Trigger
        </p>
        <p className="text-xs text-[hsl(var(--foreground))]">{label}</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !border-violet-300"
      />
    </div>
  );
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
      position: {
        x: positioned.find((n) => n.id === "__trigger__")?.x ?? 0,
        y: positioned.find((n) => n.id === "__trigger__")?.y ?? 0,
      },
      data: { trigger: definition.trigger, selected: false },
      draggable: false,
      selectable: false,
    },
    ...definition.blocks.map((block) => ({
      id: block.id,
      type: "workflowBlock",
      position: {
        x: positioned.find((n) => n.id === block.id)?.x ?? 0,
        y: positioned.find((n) => n.id === block.id)?.y ?? 0,
      },
      data: {
        block,
        selected: selectedBlockId === block.id,
      },
      draggable: false,
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
  onSelectBlock,
}: {
  definition: WorkflowDefinition;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
}) {
  const { nodes, edges } = useMemo(
    () => definitionToFlow(definition, selectedBlockId),
    [definition, selectedBlockId],
  );

  return (
    <div className="h-[520px] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          if (node.id === "__trigger__") return;
          onSelectBlock(node.id);
        }}
        onPaneClick={() => onSelectBlock(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <p className="border-t border-[hsl(var(--border))] px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
        Click a block to open the configuration panel. Branch and outcome paths are shown as labeled
        edges.
      </p>
    </div>
  );
}
