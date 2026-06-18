"use client";

import {
  type MemoryTreeLevel,
  type MemoryTreeNode,
  type MemoryTreeResult,
  getMemoryTree,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GitBranch, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type TreeScope = "conversation" | "customer" | "channel";
type TreeMode = "latest" | "drill_down";
type ChannelType = "slack" | "telegram" | "feishu" | "dingtalk";

export type MemoryTreeSelection = {
  scope: TreeScope;
  id: string;
  channelType?: ChannelType;
};

type MemoryTreePanelProps = {
  brandId: string;
  selection: MemoryTreeSelection | null;
  onClearSelection?: () => void;
};

export function MemoryTreePanel({ brandId, selection, onClearSelection }: MemoryTreePanelProps) {
  const [scope, setScope] = useState<TreeScope>("conversation");
  const [scopeId, setScopeId] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("slack");
  const [mode, setMode] = useState<TreeMode>("latest");
  const [level, setLevel] = useState("1");
  const [submitted, setSubmitted] = useState<MemoryTreeSelection | null>(null);

  useEffect(() => {
    if (!selection) return;
    setScope(selection.scope);
    setScopeId(selection.id);
    if (selection.channelType) setChannelType(selection.channelType);
    setSubmitted(selection);
  }, [selection]);

  const treeQuery = useQuery({
    queryKey: ["memory-tree", brandId, submitted, mode, level],
    queryFn: () =>
      getMemoryTree({
        brandId,
        scope: submitted?.scope ?? "conversation",
        id: submitted?.id ?? "",
        channelType: submitted?.scope === "channel" ? submitted.channelType : undefined,
        mode,
        level: mode === "drill_down" ? Number(level) : undefined,
      }),
    enabled: Boolean(brandId && submitted?.id),
    retry: false,
  });

  const tree = treeQuery.data?.tree;

  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-[hsl(var(--primary))]" />
          <h2 className="text-sm font-medium">Summary tree</h2>
        </div>
        {selection && onClearSelection ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as TreeScope)}
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-2 text-xs"
        >
          <option value="conversation">Conversation</option>
          <option value="customer">Customer topic</option>
          <option value="channel">Channel</option>
        </select>
        <input
          type="text"
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          placeholder={
            scope === "customer"
              ? "user id"
              : scope === "channel"
                ? "channel id"
                : "conversation id"
          }
          className="min-w-[180px] flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
        />
        {scope === "channel" ? (
          <select
            value={channelType}
            onChange={(e) => setChannelType(e.target.value as ChannelType)}
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-2 text-xs"
          >
            <option value="slack">Slack</option>
            <option value="telegram">Telegram</option>
            <option value="feishu">Feishu</option>
            <option value="dingtalk">DingTalk</option>
          </select>
        ) : null}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as TreeMode)}
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-2 text-xs"
        >
          <option value="latest">Latest (L0 buffer)</option>
          <option value="drill_down">Drill down</option>
        </select>
        {mode === "drill_down" ? (
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-2 text-xs"
          >
            <option value="1">Level 1 · seal</option>
            <option value="2">Level 2 · episodes</option>
          </select>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!scopeId.trim()}
          onClick={() =>
            setSubmitted({
              scope,
              id: scopeId.trim(),
              ...(scope === "channel" ? { channelType } : {}),
            })
          }
        >
          Load tree
        </Button>
      </div>

      {!submitted ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Load a conversation, customer topic, or channel tree. Click a hot topic or search hit to
          prefill.
        </p>
      ) : treeQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <Loader2 className="size-3 animate-spin" />
          Loading tree…
        </div>
      ) : treeQuery.isError ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Tree not found for this scope.
        </p>
      ) : tree ? (
        <TreeLevels tree={tree} />
      ) : null}
    </section>
  );
}

function TreeLevels({ tree }: { tree: MemoryTreeResult }) {
  if (tree.levels.length === 0) {
    return (
      <p className="text-xs text-[hsl(var(--muted-foreground))]">No nodes in this tree yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Scope <span className="font-mono text-[hsl(var(--foreground))]">{tree.scope}</span>
        {tree.scopeKey ? (
          <>
            {" "}
            · <span className="font-mono">{tree.scopeKey}</span>
          </>
        ) : null}
        {tree.mode ? <> · mode {tree.mode}</> : null}
      </p>
      {tree.levels.map((level) => (
        <TreeLevelBlock key={level.level} level={level} />
      ))}
    </div>
  );
}

function TreeLevelBlock({ level }: { level: MemoryTreeLevel }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
      <div className="flex items-center gap-1 border-b border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        <ChevronRight className="size-3" />
        Level {level.level} · {level.nodes.length} node{level.nodes.length === 1 ? "" : "s"}
      </div>
      <ul className="divide-y divide-[hsl(var(--border))]">
        {level.nodes.map((node) => (
          <TreeNodeRow key={nodeKey(node)} node={node} />
        ))}
      </ul>
    </div>
  );
}

function nodeKey(node: MemoryTreeNode): string {
  if (node.kind === "leaf") return node.chunkId;
  if (node.kind === "summary") return node.summaryId;
  return node.episodeId;
}

function TreeNodeRow({ node }: { node: MemoryTreeNode }) {
  if (node.kind === "leaf") {
    return (
      <li className="space-y-1 px-3 py-2 text-sm">
        <div className="flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="rounded bg-[hsl(var(--surface-1))] px-1.5 py-0.5">leaf</span>
          <span>{node.lifecycle}</span>
          {node.fastScore != null ? <span>fast {node.fastScore.toFixed(2)}</span> : null}
        </div>
        <p className="line-clamp-4 text-[hsl(var(--foreground))]">{node.body}</p>
      </li>
    );
  }

  if (node.kind === "summary") {
    return (
      <li className="space-y-1 px-3 py-2 text-sm">
        <div className="flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="rounded bg-[hsl(var(--surface-1))] px-1.5 py-0.5">summary</span>
          <span>{new Date(node.sealedAt).toLocaleString()}</span>
        </div>
        {node.title ? (
          <p className="font-medium text-[hsl(var(--foreground))]">{node.title}</p>
        ) : null}
        <p className="line-clamp-4 text-[hsl(var(--foreground))]">{node.summary}</p>
      </li>
    );
  }

  return (
    <li className="space-y-1 px-3 py-2 text-sm">
      <div className="flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="rounded bg-[hsl(var(--surface-1))] px-1.5 py-0.5">episode</span>
        {node.topic ? <span>{node.topic}</span> : null}
      </div>
      <p className="line-clamp-4 text-[hsl(var(--foreground))]">{node.summary}</p>
    </li>
  );
}
