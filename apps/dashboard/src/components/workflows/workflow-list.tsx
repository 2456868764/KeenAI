"use client";

import {
  type Workflow,
  type WorkflowDefinition,
  type WorkflowTemplate,
  createWorkflow,
  listWorkflowTemplates,
  listWorkflows,
  reorderWorkflows,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  GripVertical,
  Hand,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Rocket,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useMemo, useState } from "react";
import { triggerLabel } from "./workflow-graph";
import { workflowGroupNotice } from "./workflow-list-meta";

type StatusFilter = "all" | Workflow["status"];
type TriggerFilter = "all" | WorkflowDefinition["trigger"];
type TypeFilter = "all" | "ai" | "customer_facing" | "internal";
type TemplateView = "browse" | "preview";

const scratchDefinition: WorkflowDefinition = {
  trigger: "page_view",
  pageRules: [{ urlOp: "contains", url: "/", timeOnPageSec: 0 }],
  audience: { match: "all", rules: [] },
  blocks: [
    {
      id: "welcome",
      type: "send_message",
      plainText: "Hello! How can I help you today?",
    },
    {
      id: "buttons",
      type: "reply_buttons",
      prompt: "Choose an option",
      allowFreeText: true,
      buttons: [
        { id: "login", label: "I can't log in", nextId: null },
        { id: "bug", label: "I found a bug", nextId: null },
      ],
    },
  ],
};

const templateCategories = [
  { id: "popular", label: "Popular" },
  { id: "ai", label: "Fibi AI Agent" },
  { id: "handoff", label: "Teammate Efficiency" },
  { id: "self_serve", label: "End User Experience" },
  { id: "lead_capture", label: "Message Proactively" },
] as const;

function workflowKind(workflow: Workflow): TypeFilter {
  if (workflow.definition.blocks.some((block) => block.type === "let_keeni_answer")) return "ai";
  if (
    workflow.definition.blocks.some((block) =>
      [
        "send_message",
        "reply_buttons",
        "collect_data",
        "collect_customer_reply",
        "csat",
        "send_ticket_form",
      ].includes(block.type),
    )
  ) {
    return "customer_facing";
  }
  return "internal";
}

function workflowTriggerGroup(trigger: WorkflowDefinition["trigger"]) {
  if (trigger === "page_view") {
    return {
      key: "page_view",
      title: "When customer visits a page",
      description:
        "Only the top customer-facing workflow that matches will run. Drag workflows to reorder priority",
      icon: Rocket,
      accent: "from-violet-600 to-indigo-950",
    };
  }
  if (trigger === "new_messenger_conversation" || trigger === "first_message") {
    return {
      key: "messenger",
      title: "When customer opens a new conversation in the Messenger",
      description:
        "Only the top customer-facing workflow that matches will run. Drag workflows to reorder priority",
      icon: Hand,
      accent: "from-sky-500 to-blue-950",
    };
  }
  if (trigger === "customer_unresponsive" || trigger === "teammate_unresponsive") {
    return {
      key: "unresponsive",
      title: "When a conversation becomes stale",
      description: "Follow up, bump, assign, or close conversations after a delay",
      icon: Clock3,
      accent: "from-lime-500 to-emerald-950",
    };
  }
  return {
    key: trigger,
    title: triggerLabel(trigger),
    description: "Workflow automation triggered by this event",
    icon: Zap,
    accent: "from-violet-500 to-slate-950",
  };
}

function formatUpdatedAt(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(delta / 86_400_000));
  if (days === 0) return "Updated just now";
  if (days === 1) return "Updated 1d ago";
  return `Updated ${days}d ago`;
}

function cloneDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}

export function WorkflowListShell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateView, setTemplateView] = useState<TemplateView>("browse");
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [category, setCategory] = useState<(typeof templateCategories)[number]["id"]>("popular");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const templatesQuery = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: listWorkflowTemplates,
    enabled: templateModalOpen,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; definition: WorkflowDefinition }) => createWorkflow(input),
    onSuccess: ({ workflow }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      router.push(`/workflows/${workflow.id}`);
    },
  });

  const reorder = useMutation({
    mutationFn: reorderWorkflows,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const items = data?.items ?? [];
  const visibleItems = useMemo(
    () =>
      items.filter((workflow) => {
        if (statusFilter !== "all" && workflow.status !== statusFilter) return false;
        if (triggerFilter !== "all" && workflow.definition.trigger !== triggerFilter) return false;
        if (typeFilter !== "all" && workflowKind(workflow) !== typeFilter) return false;
        return true;
      }),
    [items, statusFilter, triggerFilter, typeFilter],
  );

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { meta: ReturnType<typeof workflowTriggerGroup>; items: Workflow[] }
    >();
    for (const workflow of visibleItems) {
      const meta = workflowTriggerGroup(workflow.definition.trigger);
      const group = map.get(meta.key) ?? { meta, items: [] };
      group.items.push(workflow);
      map.set(meta.key, group);
    }
    return [...map.values()].map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }),
    }));
  }, [visibleItems]);

  const canReorderGroups =
    statusFilter === "all" && triggerFilter === "all" && typeFilter === "all";

  const templates = templatesQuery.data?.items ?? [];
  const visibleTemplates =
    category === "popular"
      ? templates.slice(0, 8)
      : templates.filter((template) => template.category === category).slice(0, 8);

  const openTemplates = () => {
    setMenuOpen(false);
    setTemplateModalOpen(true);
    setTemplateView("browse");
    setSelectedTemplate(null);
  };

  const createFromScratch = () => {
    setMenuOpen(false);
    create.mutate({ name: "Untitled workflow", definition: cloneDefinition(scratchDefinition) });
  };

  const createFromTemplate = (template: WorkflowTemplate) => {
    create.mutate({ name: template.name, definition: cloneDefinition(template.definition) });
  };

  return (
    <div className="flex h-full bg-[hsl(var(--surface-0))]">
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Workflows</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Build customer-facing and internal automations from the same canvas.
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <FilterButton
              icon={CheckCircle2}
              label={statusFilter === "all" ? "All states" : statusFilter}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[
                ["all", "All states"],
                ["draft", "Draft"],
                ["published", "Published"],
              ]}
            />
            <FilterButton
              icon={Filter}
              label={triggerFilter === "all" ? "All triggers" : triggerLabel(triggerFilter)}
              value={triggerFilter}
              onChange={(value) => setTriggerFilter(value as TriggerFilter)}
              options={[
                ["all", "All triggers"],
                ["page_view", "Page visits"],
                ["first_message", "First message"],
                ["customer_unresponsive", "Customer unresponsive"],
                ["schedule", "Schedule"],
                ["webhook", "Webhook"],
              ]}
            />
            <FilterButton
              icon={Filter}
              label={
                typeFilter === "all"
                  ? "All types"
                  : typeFilter.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
              }
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as TypeFilter)}
              options={[
                ["all", "All types"],
                ["customer_facing", "Customer-facing"],
                ["ai", "AI"],
                ["internal", "Internal"],
              ]}
            />
            <Button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              New Workflow
            </Button>
            {menuOpen ? (
              <div className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-2 shadow-xl">
                <MenuAction icon={Plus} label="From scratch" onClick={createFromScratch} />
                <MenuAction icon={Star} label="Choose from template" onClick={openTemplates} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 space-y-10">
          {isLoading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading workflows...</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error.message}</p>
          ) : groups.length === 0 ? (
            <EmptyState onCreate={createFromScratch} onTemplates={openTemplates} />
          ) : (
            groups.map((group) => (
              <WorkflowGroup
                key={group.meta.key}
                meta={group.meta}
                workflows={group.items}
                canReorder={
                  canReorderGroups &&
                  new Set(group.items.map((workflow) => workflow.definition.trigger)).size === 1
                }
                reordering={reorder.isPending}
                onCreate={createFromScratch}
                onReorder={(workflowIds) => {
                  const trigger = group.items[0]?.definition.trigger;
                  if (!trigger) return;
                  reorder.mutate({ trigger, workflowIds });
                }}
              />
            ))
          )}
        </div>
      </main>

      {templateModalOpen ? (
        <TemplateDialog
          view={templateView}
          category={category}
          templates={visibleTemplates}
          loading={templatesQuery.isLoading}
          selectedTemplate={selectedTemplate}
          creating={create.isPending}
          onCategory={setCategory}
          onClose={() => setTemplateModalOpen(false)}
          onPreview={(template) => {
            setSelectedTemplate(template);
            setTemplateView("preview");
          }}
          onBack={() => setTemplateView("browse")}
          onUse={(template) => createFromTemplate(template)}
        />
      ) : null}
    </div>
  );
}

function FilterButton({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Filter;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm font-semibold shadow-sm">
      <Icon className="size-4 text-[hsl(var(--muted-foreground))]" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="size-4 text-[hsl(var(--muted-foreground))]" />
    </label>
  );
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold hover:bg-[hsl(var(--surface-2))]"
    >
      <Icon className="size-4 text-[hsl(var(--muted-foreground))]" />
      {label}
    </button>
  );
}

function WorkflowGroup({
  meta,
  workflows,
  canReorder,
  reordering,
  onCreate,
  onReorder,
}: {
  meta: ReturnType<typeof workflowTriggerGroup>;
  workflows: Workflow[];
  canReorder: boolean;
  reordering: boolean;
  onCreate: () => void;
  onReorder: (workflowIds: string[]) => void;
}) {
  const Icon = meta.icon;
  const notice = workflowGroupNotice(meta.key);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId || !canReorder || reordering) return;
    const ordered = [...workflows];
    const fromIndex = ordered.findIndex((workflow) => workflow.id === draggingId);
    const toIndex = ordered.findIndex((workflow) => workflow.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    if (!moved) return;
    ordered.splice(toIndex, 0, moved);
    onReorder(ordered.map((workflow) => workflow.id));
  };

  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${meta.accent} text-white shadow-md`}
          >
            <Icon className="size-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">
              {meta.title}{" "}
              <span className="text-[hsl(var(--muted-foreground))]">({workflows.length})</span>
            </h3>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{meta.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-2 shadow-sm hover:bg-[hsl(var(--surface-2))]"
          aria-label={`Add workflow to ${meta.title}`}
        >
          <Plus className="size-5" />
        </button>
      </div>
      {notice ? (
        <div className="mb-5 flex min-h-[64px] items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-5 py-4 shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-[hsl(var(--primary))]">
            <Sparkles className="size-5" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-700">{notice.text}</p>
          <Link
            href={notice.href}
            className="shrink-0 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
          >
            {notice.linkLabel} →
          </Link>
        </div>
      ) : null}
      <div className="space-y-3">
        {workflows.map((workflow) => (
          <WorkflowRow
            key={workflow.id}
            workflow={workflow}
            canReorder={canReorder && !reordering}
            dragging={draggingId === workflow.id}
            onDragStart={(event) => {
              if (!canReorder || reordering) return;
              setDraggingId(workflow.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", workflow.id);
            }}
            onDragOver={(event) => {
              if (!canReorder || !draggingId || draggingId === workflow.id || reordering) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(workflow.id);
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </div>
    </section>
  );
}

function WorkflowRow({
  workflow,
  canReorder,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  workflow: Workflow;
  canReorder: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLAnchorElement>) => void;
  onDragOver: (event: DragEvent<HTMLAnchorElement>) => void;
  onDrop: (event: DragEvent<HTMLAnchorElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/workflows/${workflow.id}`}
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={[
        "flex min-h-[68px] items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-5 py-4 shadow-sm transition hover:border-[hsl(var(--primary)/0.45)] hover:shadow-md",
        canReorder ? "cursor-grab active:cursor-grabbing" : "",
        dragging ? "opacity-55 ring-2 ring-[hsl(var(--primary))]" : "",
      ].join(" ")}
    >
      <div className="min-w-0">
        <h4 className="truncate text-base font-semibold">{workflow.name}</h4>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          {workflow.definition.blocks.length} step
          {workflow.definition.blocks.length === 1 ? "" : "s"} ·{" "}
          {workflowKind(workflow).replaceAll("_", " ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
        <StatusBadge status={workflow.status} />
        <span>{formatUpdatedAt(workflow.updatedAt)}</span>
        <GripVertical
          className={[
            "size-4",
            canReorder ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]",
          ].join(" ")}
        />
        <MoreHorizontal className="size-4" />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: Workflow["status"] }) {
  return (
    <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-1 text-xs font-semibold capitalize">
      {status}
    </span>
  );
}

function EmptyState({ onCreate, onTemplates }: { onCreate: () => void; onTemplates: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-10 text-center">
      <Sparkles className="mx-auto size-8 text-[hsl(var(--primary))]" />
      <h3 className="mt-4 text-lg font-semibold">No workflows match these filters</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
        Create a workflow from scratch or start from a Featurebase-style template.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button type="button" onClick={onCreate}>
          From scratch
        </Button>
        <Button type="button" variant="outline" onClick={onTemplates}>
          Choose template
        </Button>
      </div>
    </div>
  );
}

function TemplateDialog({
  view,
  category,
  templates,
  loading,
  selectedTemplate,
  creating,
  onCategory,
  onClose,
  onPreview,
  onBack,
  onUse,
}: {
  view: TemplateView;
  category: (typeof templateCategories)[number]["id"];
  templates: WorkflowTemplate[];
  loading: boolean;
  selectedTemplate: WorkflowTemplate | null;
  creating: boolean;
  onCategory: (category: (typeof templateCategories)[number]["id"]) => void;
  onClose: () => void;
  onPreview: (template: WorkflowTemplate) => void;
  onBack: () => void;
  onUse: (template: WorkflowTemplate) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close templates"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-xl bg-[hsl(var(--primary)/0.25)] p-3 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--primary)/0.35)]"
      >
        <X className="size-5" />
      </button>
      <div className="h-[min(760px,82vh)] w-[min(1440px,84vw)] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-2xl">
        {view === "preview" && selectedTemplate ? (
          <TemplatePreview
            template={selectedTemplate}
            creating={creating}
            onBack={onBack}
            onUse={() => onUse(selectedTemplate)}
          />
        ) : (
          <TemplateBrowser
            category={category}
            templates={templates}
            loading={loading}
            creating={creating}
            onCategory={onCategory}
            onPreview={onPreview}
            onUse={onUse}
          />
        )}
      </div>
    </div>
  );
}

function TemplateBrowser({
  category,
  templates,
  loading,
  creating,
  onCategory,
  onPreview,
  onUse,
}: {
  category: (typeof templateCategories)[number]["id"];
  templates: WorkflowTemplate[];
  loading: boolean;
  creating: boolean;
  onCategory: (category: (typeof templateCategories)[number]["id"]) => void;
  onPreview: (template: WorkflowTemplate) => void;
  onUse: (template: WorkflowTemplate) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-7 py-6">
        <h2 className="text-2xl font-semibold">Choose from templates</h2>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onUse({
              id: "scratch",
              name: "Untitled workflow",
              description: "",
              category: "automation",
              definition: scratchDefinition,
            })
          }
        >
          <Plus className="mr-2 size-4" />
          Create from scratch
        </Button>
      </header>
      <div className="grid flex-1 grid-cols-[300px_minmax(0,1fr)] gap-8 overflow-hidden p-7">
        <aside className="space-y-2">
          {templateCategories.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => onCategory(item.id)}
              className={[
                "block w-full rounded-lg px-4 py-3 text-left text-sm font-semibold",
                category === item.id
                  ? "border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </aside>
        <section className="overflow-y-auto">
          {loading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading templates...</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  creating={creating}
                  onPreview={() => onPreview(template)}
                  onUse={() => onUse(template)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  creating,
  onPreview,
  onUse,
}: {
  template: WorkflowTemplate;
  creating: boolean;
  onPreview: () => void;
  onUse: () => void;
}) {
  return (
    <article className="group relative rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] p-5 shadow-sm transition hover:shadow-md">
      <button type="button" onClick={onPreview} className="flex w-full gap-4 text-left">
        <TemplateIcon category={template.category} />
        <div>
          <h3 className="text-base font-semibold">{template.name}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{template.description}</p>
        </div>
      </button>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPreview}
          className="text-xs font-semibold text-[hsl(var(--primary))] opacity-0 transition group-hover:opacity-100"
        >
          Click to preview the template
        </button>
        <Button type="button" size="sm" variant="outline" disabled={creating} onClick={onUse}>
          Use
        </Button>
      </div>
    </article>
  );
}

function TemplatePreview({
  template,
  creating,
  onBack,
  onUse,
}: {
  template: WorkflowTemplate;
  creating: boolean;
  onBack: () => void;
  onUse: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-7 py-6">
        <div>
          <h2 className="text-xl font-semibold">{template.name}</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{template.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onUse} disabled={creating}>
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Use this template
          </Button>
        </div>
      </header>
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:16px_16px]">
        <TemplatePreviewCanvas definition={template.definition} />
      </div>
    </div>
  );
}

function TemplatePreviewCanvas({ definition }: { definition: WorkflowDefinition }) {
  const firstBlock = definition.blocks[0];
  const followUpBlocks = definition.blocks.slice(1, 5);

  return (
    <div className="absolute left-[10%] top-[18%] h-[440px] w-[820px]">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible text-violet-500"
        viewBox="0 0 820 440"
      >
        <title>Template workflow preview connections</title>
        <path
          d="M 254 166 C 302 166 300 106 348 106"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <circle cx="348" cy="106" r="5" fill="currentColor" />
        <path
          d="M 602 126 C 646 126 644 126 688 126"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <circle cx="688" cy="126" r="5" fill="currentColor" />
        {followUpBlocks.length > 1 ? (
          <>
            <path
              d="M 602 170 C 646 174 644 234 688 238"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
            <circle cx="688" cy="238" r="4" fill="currentColor" />
          </>
        ) : null}
      </svg>
      <div className="absolute left-0 top-[76px]">
        <MiniNode title="Trigger action" body={triggerLabel(definition.trigger)} icon={Zap} />
      </div>
      <div className="absolute left-[348px] top-0">
        <MiniNode
          title="Website visitor flow"
          body={firstBlock?.type.replaceAll("_", " ") ?? "Message"}
          icon={MessageCircle}
        />
      </div>
      <div className="absolute left-[688px] top-[86px]">
        <MiniStack blocks={followUpBlocks} />
      </div>
    </div>
  );
}

function TemplateIcon({ category }: { category: WorkflowTemplate["category"] }) {
  const Icon =
    category === "ai"
      ? Sparkles
      : category === "lead_capture"
        ? MessageCircle
        : category === "handoff"
          ? Hand
          : category === "csat"
            ? CheckCircle2
            : Rocket;
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-slate-950 text-white">
      <Icon className="size-6" />
    </div>
  );
}

function MiniNode({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: typeof Zap;
}) {
  return (
    <div className="w-64 rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-lg">
      <p className="flex items-center gap-1 text-xs font-semibold text-violet-600">
        <Icon className="size-3.5" />
        {title}
      </p>
      <div className="mt-3 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">{body}</p>
      </div>
    </div>
  );
}

function MiniStack({ blocks }: { blocks: WorkflowDefinition["blocks"] }) {
  return (
    <div className="w-72 rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-lg">
      <p className="text-xs font-semibold text-violet-600">Workflow Action</p>
      <div className="mt-3 space-y-3">
        {blocks.length === 0 ? (
          <div className="rounded-lg bg-white p-4 text-sm font-semibold text-slate-700">End</div>
        ) : (
          blocks.map((block) => (
            <div
              key={block.id}
              className="rounded-lg bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm"
            >
              {block.type.replaceAll("_", " ")}
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm"
      >
        + Add step
      </button>
    </div>
  );
}
