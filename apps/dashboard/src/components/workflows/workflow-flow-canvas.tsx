"use client";

import type { WorkflowBlock, WorkflowDefinition } from "@/lib/api";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect } from "react";

type BlockNodeData = {
  block: WorkflowBlock;
  onChange: (block: WorkflowBlock) => void;
};

function blockLabel(block: WorkflowBlock): string {
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
  }
}

function WorkflowBlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const block = data.block;
  return (
    <div className="min-w-[180px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[hsl(var(--primary))]" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
        {block.type.replace("_", " ")}
      </p>
      <p className="mt-1 text-xs text-[hsl(var(--foreground))]">{blockLabel(block)}</p>
      {block.type === "send_message" ? (
        <>
          <textarea
            value={block.plainText ?? ""}
            onChange={(e) => data.onChange({ ...block, plainText: e.target.value })}
            rows={2}
            placeholder="Message text (optional if attachments are set)"
            className="mt-2 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 py-1 text-xs"
          />
          <input
            value={(block.attachmentIds ?? []).join(", ")}
            onChange={(e) => {
              const ids = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              data.onChange({ ...block, attachmentIds: ids.length > 0 ? ids : undefined });
            }}
            placeholder="Attachment IDs (comma-separated)"
            className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 py-1 text-xs"
          />
        </>
      ) : null}
      {block.type === "let_keeni_answer" ? (
        <textarea
          value={block.instructions ?? ""}
          onChange={(e) => data.onChange({ ...block, instructions: e.target.value })}
          rows={2}
          placeholder="Optional instructions for Keeni"
          className="mt-2 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 py-1 text-xs"
        />
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-[hsl(var(--primary))]" />
    </div>
  );
}

const nodeTypes = { workflowBlock: WorkflowBlockNode };

function blocksToFlow(
  definition: WorkflowDefinition,
  onBlockChange: (id: string, block: WorkflowBlock) => void,
): { nodes: Node<BlockNodeData>[]; edges: Edge[] } {
  const nodes: Node<BlockNodeData>[] = definition.blocks.map((block, index) => ({
    id: block.id,
    type: "workflowBlock",
    position: { x: index * 240, y: 80 },
    data: {
      block,
      onChange: (next) => onBlockChange(block.id, next),
    },
  }));

  const edges: Edge[] = definition.blocks.slice(1).flatMap((block, index) => {
    const source = definition.blocks[index]?.id;
    if (!source) return [];
    return [
      {
        id: `e-${source}-${block.id}`,
        source,
        target: block.id,
        animated: true,
      },
    ];
  });

  return { nodes, edges };
}

function flowToBlocks(nodes: Node<BlockNodeData>[]): WorkflowBlock[] {
  return [...nodes].sort((a, b) => a.position.x - b.position.x).map((node) => node.data.block);
}

export function WorkflowFlowCanvas({
  definition,
  onDefinitionChange,
}: {
  definition: WorkflowDefinition;
  onDefinitionChange: (definition: WorkflowDefinition) => void;
}) {
  const onBlockChange = useCallback(
    (id: string, block: WorkflowBlock) => {
      onDefinitionChange({
        ...definition,
        blocks: definition.blocks.map((b) => (b.id === id ? block : b)),
      });
    },
    [definition, onDefinitionChange],
  );

  const initial = blocksToFlow(definition, onBlockChange);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    const next = blocksToFlow(definition, onBlockChange);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [definition, onBlockChange, setNodes, setEdges]);

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodesConnectable={false}
        onNodeDragStop={() => {
          onDefinitionChange({
            ...definition,
            blocks: flowToBlocks(nodes),
          });
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
