"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type Roadmap,
  type RoadmapItem,
  createRoadmapItem,
  deleteRoadmapItem,
  ensureDefaultRoadmap,
  fetchMe,
  listRoadmapBoardItems,
  updateRoadmapItem,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Columns3, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type ViewMode = "kanban" | "timeline";

export function RoadmapShell() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("kanban");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eta, setEta] = useState("");
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const boardQuery = useQuery({
    queryKey: ["roadmap-board", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { roadmap } = await ensureDefaultRoadmap(brandId as string);
      return listRoadmapBoardItems(roadmap.id);
    },
  });

  const roadmap = boardQuery.data?.roadmap ?? null;
  const items = boardQuery.data?.items ?? [];

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["roadmap-board"] });

  const create = useMutation({
    mutationFn: () =>
      createRoadmapItem(roadmap?.id as string, {
        title: title.trim(),
        description: description.trim() || undefined,
        eta: eta ? new Date(eta).toISOString() : undefined,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setEta("");
      invalidate();
    },
  });

  const moveItem = useMutation({
    mutationFn: (input: { itemId: string; columnId: string; sortOrder: number }) =>
      updateRoadmapItem(roadmap?.id as string, input.itemId, {
        columnId: input.columnId,
        sortOrder: input.sortOrder,
      }),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => deleteRoadmapItem(roadmap?.id as string, itemId),
    onSuccess: invalidate,
  });

  const itemsByColumn = useMemo(() => {
    if (!roadmap) return new Map<string, RoadmapItem[]>();
    const map = new Map<string, RoadmapItem[]>();
    for (const column of roadmap.columns) {
      map.set(
        column.id,
        items
          .filter((item) => item.columnId === column.id)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
      );
    }
    return map;
  }, [items, roadmap]);

  const timelineItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.eta && b.eta) return a.eta.localeCompare(b.eta);
      if (a.eta) return -1;
      if (b.eta) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [items]);

  function handleDrop(columnId: string) {
    if (!dragItemId || !roadmap) return;
    const columnItems = itemsByColumn.get(columnId) ?? [];
    moveItem.mutate({ itemId: dragItemId, columnId, sortOrder: columnItems.length });
    setDragItemId(null);
  }

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Roadmap">
        <div className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] p-0.5">
          <ViewToggle active={view === "kanban"} onClick={() => setView("kanban")}>
            <Columns3 className="mr-1 size-3.5" />
            Kanban
          </ViewToggle>
          <ViewToggle active={view === "timeline"} onClick={() => setView("timeline")}>
            <CalendarDays className="mr-1 size-3.5" />
            Timeline
          </ViewToggle>
        </div>
      </AppHeader>

      <main className="flex flex-1 flex-col overflow-hidden p-4">
        <form
          className="mb-4 grid gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4 md:grid-cols-[1fr_1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && roadmap) create.mutate();
          }}
        >
          <input
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            placeholder="Initiative title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="date"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={create.isPending || !title.trim() || !roadmap}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="mr-1 size-4" />
            )}
            Add item
          </Button>
        </form>

        {boardQuery.isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading roadmap…</p>
        ) : boardQuery.error ? (
          <p className="text-sm text-red-400">{boardQuery.error.message}</p>
        ) : !roadmap ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No roadmap available.</p>
        ) : view === "kanban" ? (
          <KanbanBoard
            roadmap={roadmap}
            itemsByColumn={itemsByColumn}
            dragItemId={dragItemId}
            onDragStart={setDragItemId}
            onDragEnd={() => setDragItemId(null)}
            onDrop={handleDrop}
            onDelete={(itemId) => removeItem.mutate(itemId)}
          />
        ) : (
          <TimelineView roadmap={roadmap} items={timelineItems} />
        )}
      </main>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center rounded px-2 py-1 text-xs font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--surface-2))]"
          : "inline-flex items-center rounded px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      }
    >
      {children}
    </button>
  );
}

function KanbanBoard({
  roadmap,
  itemsByColumn,
  dragItemId,
  onDragStart,
  onDragEnd,
  onDrop,
  onDelete,
}: {
  roadmap: Roadmap;
  itemsByColumn: Map<string, RoadmapItem[]>;
  dragItemId: string | null;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDrop: (columnId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
      {roadmap.columns.map((column) => (
        <section
          key={column.id}
          className="flex w-72 shrink-0 flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(column.id);
          }}
        >
          <header className="border-b border-[hsl(var(--border))] px-3 py-2 text-sm font-medium">
            {column.label}
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
              {(itemsByColumn.get(column.id) ?? []).length}
            </span>
          </header>
          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            {(itemsByColumn.get(column.id) ?? []).map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => onDragStart(item.id)}
                onDragEnd={onDragEnd}
                className={
                  dragItemId === item.id
                    ? "cursor-grabbing rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--surface-2))] p-3 opacity-70"
                    : "cursor-grab rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description ? (
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.description}
                      </p>
                    ) : null}
                    {item.eta ? (
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        ETA {new Date(item.eta).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Delete item"
                    className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-1))] hover:text-red-400"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TimelineView({ roadmap, items }: { roadmap: Roadmap; items: RoadmapItem[] }) {
  const columnLabel = (columnId: string) =>
    roadmap.columns.find((column) => column.id === columnId)?.label ?? columnId;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      {items.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No roadmap items yet.</p>
      ) : (
        <ol className="relative border-l border-[hsl(var(--border))] pl-6">
          {items.map((item) => (
            <li key={item.id} className="mb-6 last:mb-0">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-[hsl(var(--primary))]" />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {item.eta ? new Date(item.eta).toLocaleDateString() : "No ETA"} ·{" "}
                {columnLabel(item.columnId)}
              </p>
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {item.description}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
