"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type KbDocument,
  type KbSource,
  createKbFileUploadSource,
  createKbQaSource,
  createKbWebCrawlSource,
  deleteKbSource,
  fetchMe,
  getKbSource,
  listKbSources,
  syncKbSource,
  updateKbSourceStatus,
  upsertKbNativeSource,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Filter,
  Globe2,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

const ACCEPTED_DOCUMENT_TYPES = [
  ".pdf",
  ".docx",
  ".md",
  ".markdown",
  ".txt",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
].join(",");

type Dialog = "upload" | "crawl" | "qa" | null;
type SourceFilter = "all" | "native" | "files" | "websites" | "qa" | "active" | "disabled";
type SourceKind = "native" | "file" | "website" | "qa";
type CrawlMode = "crawl_links" | "individual_links";
type QuestionField = { id: string; value: string };

const nativeSources = [
  {
    type: "changelog" as const,
    title: "Updates portal",
    description: "Published updates only, not drafts or unreleased content.",
  },
  {
    type: "feedback" as const,
    title: "Feedback portal",
    description: "Posts visible on your portal, excluding private or in-review statuses.",
  },
  {
    type: "help_center" as const,
    title: "Help center portal",
    description: "Live help center articles, excluding internal or unpublished drafts.",
  },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("file_read_failed"));
        return;
      }
      resolve(value);
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("file_read_failed"));
        return;
      }
      resolve(value);
    };
    reader.readAsText(file);
  });
}

function contentTypeForFile(file: File): string {
  const lowerName = file.name.toLowerCase();
  if (file.type) return file.type;
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) return "text/markdown";
  if (lowerName.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function shouldReadAsText(file: File): boolean {
  const contentType = contentTypeForFile(file);
  const lowerName = file.name.toLowerCase();
  return (
    contentType.startsWith("text/") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".txt")
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sourceKind(source: KbSource): SourceKind {
  if (source.config.sourceKind === "native") return "native";
  if (source.config.sourceKind === "qa") return "qa";
  if (source.config.sourceKind === "website" || source.type === "web_crawl") return "website";
  if (source.type === "help_center" || source.type === "feedback" || source.type === "changelog") {
    return "native";
  }
  return "file";
}

function sourceTitle(source: KbSource): string {
  return source.name ?? "Untitled source";
}

function sourceUrl(source: KbSource): string | null {
  const url = source.config.urls?.[0]?.url;
  if (typeof url === "string") return url;
  const docUrl = source.config.documents?.[0]?.url;
  return typeof docUrl === "string" ? docUrl.replace(/^file:\/\//, "") : null;
}

function sourceMatchesSearch(source: KbSource, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [sourceTitle(source), source.type, source.status, sourceUrl(source) ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function filterByKind(source: KbSource, filter: SourceFilter): boolean {
  const kind = sourceKind(source);
  if (filter === "all") return true;
  if (filter === "active") return source.status !== "disabled";
  if (filter === "disabled") return source.status === "disabled";
  if (filter === "files") return kind === "file";
  if (filter === "websites") return kind === "website";
  return kind === filter;
}

function splitTextList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function newQuestionField(value = ""): QuestionField {
  return {
    id: `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    value,
  };
}

export function KnowledgeBaseShell() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailSourceId, setDetailSourceId] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const sourcesQuery = useQuery({
    queryKey: ["kb-sources", brandId],
    queryFn: () => listKbSources(brandId as string),
    enabled: Boolean(brandId),
  });

  const detailQuery = useQuery({
    queryKey: ["kb-source-detail", detailSourceId],
    queryFn: () => getKbSource(detailSourceId as string),
    enabled: Boolean(detailSourceId),
  });

  const sources = sourcesQuery.data?.items ?? [];
  const visibleSources = useMemo(
    () =>
      sources.filter(
        (source) => sourceMatchesSearch(source, query) && filterByKind(source, filter),
      ),
    [sources, query, filter],
  );

  const grouped = useMemo(
    () => ({
      native: sources.filter((source) => sourceKind(source) === "native"),
      file: visibleSources.filter((source) => sourceKind(source) === "file"),
      website: visibleSources.filter((source) => sourceKind(source) === "website"),
      qa: visibleSources.filter((source) => sourceKind(source) === "qa"),
    }),
    [sources, visibleSources],
  );

  const invalidateSources = () => {
    void queryClient.invalidateQueries({ queryKey: ["kb-sources"] });
  };

  const nativeMutation = useMutation({
    mutationFn: (input: { type: (typeof nativeSources)[number]["type"]; enabled: boolean }) => {
      if (!brandId) throw new Error("missing_brand");
      return upsertKbNativeSource({ brandId, ...input });
    },
    onSuccess: invalidateSources,
  });

  const statusMutation = useMutation({
    mutationFn: (input: { sourceId: string; status: "active" | "disabled" }) =>
      updateKbSourceStatus(input.sourceId, input.status),
    onSuccess: invalidateSources,
  });

  const syncMutation = useMutation({
    mutationFn: syncKbSource,
    onSuccess: invalidateSources,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKbSource,
    onSuccess: () => {
      setSelectedIds(new Set());
      setDetailSourceId(null);
      invalidateSources();
    },
  });

  const toggleSelection = (sourceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const selectGroup = (items: KbSource[]) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = items.every((item) => next.has(item.id));
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Training Data">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="relative hidden w-full max-w-sm sm:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input
              className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] pl-9 pr-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
              placeholder="Search training data..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="relative">
            <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <select
              className="h-10 appearance-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] pl-9 pr-8 text-sm outline-none"
              value={filter}
              onChange={(event) => setFilter(event.target.value as SourceFilter)}
            >
              <option value="all">All sources</option>
              <option value="native">Native sources</option>
              <option value="files">Training files</option>
              <option value="websites">Training websites</option>
              <option value="qa">Training Q&A</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          </label>
          <div className="relative">
            <Button type="button" onClick={() => setAddOpen((open) => !open)}>
              <Plus className="mr-2 size-4" />
              Add Training Data
            </Button>
            {addOpen ? (
              <AddMenu
                onSelect={(next) => {
                  setAddOpen(false);
                  setDialog(next);
                }}
              />
            ) : null}
          </div>
        </div>
      </AppHeader>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
          {!brandId ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brand context...</p>
          ) : (
            <>
              <NativeSources
                sources={grouped.native}
                onToggle={(type, enabled) => nativeMutation.mutate({ type, enabled })}
                pendingType={nativeMutation.variables?.type ?? null}
                pending={nativeMutation.isPending}
              />

              <SourceSection
                title="Training files"
                kind="file"
                icon={FileText}
                sources={grouped.file}
                selectedIds={selectedIds}
                loading={sourcesQuery.isLoading}
                onAdd={() => setDialog("upload")}
                onSelectAll={selectGroup}
                onToggleSelect={toggleSelection}
                onView={setDetailSourceId}
                onSync={(sourceId) => syncMutation.mutate(sourceId)}
                onDelete={(sourceId) => deleteMutation.mutate(sourceId)}
                onStatusToggle={(source) =>
                  statusMutation.mutate({
                    sourceId: source.id,
                    status: source.status === "disabled" ? "active" : "disabled",
                  })
                }
              />

              <SourceSection
                title="Training websites"
                kind="website"
                icon={Globe2}
                sources={grouped.website}
                selectedIds={selectedIds}
                loading={sourcesQuery.isLoading}
                onAdd={() => setDialog("crawl")}
                onSelectAll={selectGroup}
                onToggleSelect={toggleSelection}
                onView={setDetailSourceId}
                onSync={(sourceId) => syncMutation.mutate(sourceId)}
                onDelete={(sourceId) => deleteMutation.mutate(sourceId)}
                onStatusToggle={(source) =>
                  statusMutation.mutate({
                    sourceId: source.id,
                    status: source.status === "disabled" ? "active" : "disabled",
                  })
                }
              />

              <SourceSection
                title="Training Q&A"
                kind="qa"
                icon={HelpCircle}
                sources={grouped.qa}
                selectedIds={selectedIds}
                loading={sourcesQuery.isLoading}
                onAdd={() => setDialog("qa")}
                onSelectAll={selectGroup}
                onToggleSelect={toggleSelection}
                onView={setDetailSourceId}
                onSync={(sourceId) => syncMutation.mutate(sourceId)}
                onDelete={(sourceId) => deleteMutation.mutate(sourceId)}
                onStatusToggle={(source) =>
                  statusMutation.mutate({
                    sourceId: source.id,
                    status: source.status === "disabled" ? "active" : "disabled",
                  })
                }
              />
            </>
          )}
        </div>
      </main>

      {dialog === "upload" && brandId ? (
        <UploadDialog
          brandId={brandId}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            invalidateSources();
          }}
        />
      ) : null}
      {dialog === "crawl" && brandId ? (
        <CrawlDialog
          brandId={brandId}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            invalidateSources();
          }}
        />
      ) : null}
      {dialog === "qa" && brandId ? (
        <QaDialog
          brandId={brandId}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            invalidateSources();
          }}
        />
      ) : null}
      {detailSourceId ? (
        <SourceDetailDialog
          loading={detailQuery.isLoading}
          source={detailQuery.data?.source ?? null}
          documents={detailQuery.data?.documents ?? []}
          onClose={() => setDetailSourceId(null)}
        />
      ) : null}
    </div>
  );
}

function AddMenu({ onSelect }: { onSelect: (dialog: Exclude<Dialog, null>) => void }) {
  return (
    <div className="absolute right-0 top-12 z-30 w-56 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-2 shadow-xl">
      <MenuButton icon={FileText} label="Upload Files" onClick={() => onSelect("upload")} />
      <MenuButton icon={Globe2} label="Crawl Website" onClick={() => onSelect("crawl")} />
      <MenuButton icon={HelpCircle} label="Add Q&A" onClick={() => onSelect("qa")} />
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
    >
      <Icon className="size-4 text-[hsl(var(--muted-foreground))]" />
      {label}
    </button>
  );
}

function NativeSources({
  sources,
  pending,
  pendingType,
  onToggle,
}: {
  sources: KbSource[];
  pending: boolean;
  pendingType: (typeof nativeSources)[number]["type"] | null;
  onToggle: (type: (typeof nativeSources)[number]["type"], enabled: boolean) => void;
}) {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Featurebase-native data sources</h2>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          Choose which portal indexes Keeni may search. Disabled sources are not queried. Files,
          websites, and Q&A below are always included when enabled.
        </p>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))]">
        {nativeSources.map((item) => {
          const source = sources.find((candidate) => candidate.type === item.type);
          const enabled = !!source && source.status !== "disabled";
          const isPending = pending && pendingType === item.type;
          return (
            <div
              key={item.type}
              className="flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] px-4 py-4 last:border-b-0"
            >
              <div>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {item.description}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                aria-pressed={enabled}
                onClick={() => onToggle(item.type, !enabled)}
                className={
                  enabled
                    ? "relative h-7 w-12 rounded-full bg-[hsl(var(--primary))] transition-colors"
                    : "relative h-7 w-12 rounded-full bg-[hsl(var(--surface-2))] transition-colors"
                }
              >
                <span
                  className={
                    enabled
                      ? "absolute right-1 top-1 size-5 rounded-full bg-white shadow"
                      : "absolute left-1 top-1 size-5 rounded-full bg-white shadow"
                  }
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SourceSection({
  title,
  kind,
  icon: Icon,
  sources,
  selectedIds,
  loading,
  onAdd,
  onSelectAll,
  onToggleSelect,
  onView,
  onSync,
  onDelete,
  onStatusToggle,
}: {
  title: string;
  kind: SourceKind;
  icon: typeof FileText;
  sources: KbSource[];
  selectedIds: Set<string>;
  loading: boolean;
  onAdd: () => void;
  onSelectAll: (sources: KbSource[]) => void;
  onToggleSelect: (sourceId: string) => void;
  onView: (sourceId: string) => void;
  onSync: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onStatusToggle: (source: KbSource) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={
              kind === "file"
                ? "flex size-11 items-center justify-center rounded-lg bg-purple-600 text-white"
                : kind === "website"
                  ? "flex size-11 items-center justify-center rounded-lg bg-sky-600 text-white"
                  : "flex size-11 items-center justify-center rounded-lg bg-teal-600 text-white"
            }
          >
            <Icon className="size-5" />
          </div>
          <h2 className="truncate text-lg font-semibold">
            {title} <span className="text-[hsl(var(--muted-foreground))]">({sources.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sources.length === 0}
            onClick={() => onSelectAll(sources)}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAdd}
            aria-label={`Add ${title}`}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading...
          </div>
        ) : sources.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            No sources added yet.
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                selected={selectedIds.has(source.id)}
                onToggleSelect={() => onToggleSelect(source.id)}
                onView={() => onView(source.id)}
                onSync={() => onSync(source.id)}
                onDelete={() => onDelete(source.id)}
                onStatusToggle={() => onStatusToggle(source)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SourceRow({
  source,
  selected,
  onToggleSelect,
  onView,
  onSync,
  onDelete,
  onStatusToggle,
}: {
  source: KbSource;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onSync: () => void;
  onDelete: () => void;
  onStatusToggle: () => void;
}) {
  const url = sourceUrl(source);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        className="size-4 rounded border-[hsl(var(--border))]"
        checked={selected}
        onChange={onToggleSelect}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{sourceTitle(source)}</p>
          <StatusDot status={source.status} />
        </div>
        <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
          {sourceKind(source) === "website"
            ? `${source.documentCount} pages`
            : `${source.documentCount} documents`}
          {"  "}· Started {formatDate(source.createdAt)}
          {url ? ` · ${url}` : ""}
        </p>
      </div>
      <button
        type="button"
        title={source.status === "disabled" ? "Enable" : "Disable"}
        aria-label={source.status === "disabled" ? "Enable" : "Disable"}
        onClick={onStatusToggle}
        className={
          source.status === "disabled"
            ? "relative h-7 w-12 rounded-full bg-[hsl(var(--surface-2))]"
            : "relative h-7 w-12 rounded-full bg-[hsl(var(--primary))]"
        }
      >
        <span
          className={
            source.status === "disabled"
              ? "absolute left-1 top-1 size-5 rounded-full bg-white shadow"
              : "absolute right-1 top-1 size-5 rounded-full bg-white shadow"
          }
        />
      </button>
      <IconButton icon={RefreshCw} label="Sync" onClick={onSync} />
      <IconButton icon={Search} label="View details" onClick={onView} />
      <IconButton icon={Trash2} label="Delete" onClick={onDelete} />
    </li>
  );
}

function StatusDot({ status }: { status: KbSource["status"] }) {
  if (status === "syncing") return <Loader2 className="size-4 animate-spin text-sky-400" />;
  if (status === "active") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === "error") return <AlertCircle className="size-4 text-red-400" />;
  return <span className="size-3 rounded-full bg-[hsl(var(--muted-foreground))]" />;
}

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
    >
      <Icon className="size-4" />
    </button>
  );
}

function DialogShell({
  children,
  onClose,
  width = "max-w-2xl",
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className={`relative max-h-[86vh] w-full overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-6 shadow-2xl ${width}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function UploadDialog({
  brandId,
  onClose,
  onDone,
}: {
  brandId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const documents = await Promise.all(
        files.map(async (file) => ({
          title: file.name,
          fileName: file.name,
          contentType: contentTypeForFile(file),
          sizeBytes: file.size,
          rawContent: shouldReadAsText(file)
            ? await readFileAsText(file)
            : await readFileAsDataUrl(file),
        })),
      );
      return createKbFileUploadSource({ brandId, documents });
    },
    onSuccess: onDone,
  });

  const addFiles = (list: FileList | File[]) => {
    setFiles((current) => {
      const next = [...current];
      for (const file of Array.from(list)) {
        if (!next.some((item) => item.name === file.name && item.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
  };

  return (
    <DialogShell onClose={onClose}>
      <h2 className="text-xl font-semibold">Add Training Data</h2>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        Upload documents to train your AI agent. Supported formats include PDF, Word, text files,
        and Markdown.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
        className="mt-6 flex min-h-56 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-6 text-center"
      >
        <Upload className="mb-4 size-7 text-[hsl(var(--muted-foreground))]" />
        <span className="text-base font-semibold">
          Drag & drop files here, or click to select files
        </span>
        <span className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Multiple files supported. Files are processed in the background.
        </span>
        <span className="mt-5 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium">
          Select Files
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENT_TYPES}
        className="hidden"
        onChange={(event) => addFiles(event.target.files ?? [])}
      />
      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <DialogError error={uploadMutation.error} />
      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          disabled={files.length === 0 || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Upload Files
        </Button>
      </div>
    </DialogShell>
  );
}

function CrawlDialog({
  brandId,
  onClose,
  onDone,
}: {
  brandId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<CrawlMode>("crawl_links");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [individualUrls, setIndividualUrls] = useState("");
  const [includePaths, setIncludePaths] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const urls = mode === "crawl_links" ? splitTextList(websiteUrl) : splitTextList(individualUrls);
  const crawlMutation = useMutation({
    mutationFn: () =>
      createKbWebCrawlSource({
        brandId,
        mode,
        urls,
        includePaths: splitTextList(includePaths),
        excludePaths: splitTextList(excludePaths),
      }),
    onSuccess: onDone,
  });

  return (
    <DialogShell onClose={onClose}>
      <h2 className="text-xl font-semibold">Crawling options</h2>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        Crawl specific web pages or submit sitemaps to continuously update your AI with the latest
        content. Configure included and excluded paths to refine what your AI learns.
      </p>
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">Crawling options</h3>
        <div className="grid rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-1 sm:grid-cols-2">
          <SegmentButton active={mode === "crawl_links"} onClick={() => setMode("crawl_links")}>
            Crawl links
          </SegmentButton>
          <SegmentButton
            active={mode === "individual_links"}
            onClick={() => setMode("individual_links")}
          >
            Individual links
          </SegmentButton>
        </div>
      </div>
      {mode === "crawl_links" ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Website URL</span>
            <input
              type="url"
              className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Include only paths{" "}
                <span className="text-[hsl(var(--muted-foreground))]">(Optional)</span>
              </span>
              <input
                className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                placeholder="blog/*, docs/*"
                value={includePaths}
                onChange={(event) => setIncludePaths(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Exclude paths{" "}
                <span className="text-[hsl(var(--muted-foreground))]">(Optional)</span>
              </span>
              <input
                className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                placeholder="admin/*, preview/*"
                value={excludePaths}
                onChange={(event) => setExcludePaths(event.target.value)}
              />
            </label>
          </div>
        </div>
      ) : (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold">
            URLs (one per line or comma separated)
          </span>
          <textarea
            className="min-h-44 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3 text-sm"
            placeholder={"https://example.com/page-1\nhttps://example.com/page-2"}
            value={individualUrls}
            onChange={(event) => setIndividualUrls(event.target.value)}
          />
        </label>
      )}
      <DialogError error={crawlMutation.error} />
      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          disabled={urls.length === 0 || crawlMutation.isPending}
          onClick={() => crawlMutation.mutate()}
        >
          {crawlMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {mode === "crawl_links" ? "Start crawl" : "Fetch URLs"}
        </Button>
      </div>
    </DialogShell>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-[hsl(var(--surface-1))] px-4 py-2 text-sm font-semibold shadow-sm"
          : "rounded-md px-4 py-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]"
      }
    >
      {children}
    </button>
  );
}

function QaDialog({
  brandId,
  onClose,
  onDone,
}: {
  brandId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionField[]>(() => [newQuestionField()]);
  const [answer, setAnswer] = useState("");
  const qaMutation = useMutation({
    mutationFn: () =>
      createKbQaSource({
        brandId,
        title,
        questions: questions.map((question) => question.value.trim()).filter(Boolean),
        answer,
      }),
    onSuccess: onDone,
  });

  return (
    <DialogShell onClose={onClose}>
      <h2 className="text-xl font-semibold">Add responses for common questions</h2>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        Craft responses for important questions, ensuring your AI Agent shares the most relevant
        info.
      </p>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Title</span>
          <input
            className="h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
            placeholder="Ex: Refund requests"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div>
          <span className="mb-2 block text-sm font-semibold">Question</span>
          <div className="space-y-2">
            {questions.map((question) => (
              <div key={question.id} className="flex gap-2">
                <input
                  className="h-11 min-w-0 flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                  placeholder="Ex: How do I request a refund?"
                  value={question.value}
                  onChange={(event) =>
                    setQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <IconButton
                  icon={X}
                  label="Remove question"
                  onClick={() =>
                    setQuestions((current) =>
                      current.length === 1
                        ? [newQuestionField()]
                        : current.filter((item) => item.id !== question.id),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setQuestions((current) => [...current, newQuestionField()])}
          >
            <Plus className="mr-2 size-4" />
            Add another question
          </Button>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Answer</span>
          <textarea
            className="min-h-36 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3 text-sm"
            placeholder="Enter your answer..."
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </label>
      </div>
      <DialogError error={qaMutation.error} />
      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          disabled={!title.trim() || !answer.trim() || qaMutation.isPending}
          onClick={() => qaMutation.mutate()}
        >
          {qaMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Add Q&A
        </Button>
      </div>
    </DialogShell>
  );
}

function SourceDetailDialog({
  source,
  documents,
  loading,
  onClose,
}: {
  source: KbSource | null;
  documents: KbDocument[];
  loading: boolean;
  onClose: () => void;
}) {
  const urls =
    source?.config.urls?.map((item) => item.url).filter((url): url is string => !!url) ?? [];
  return (
    <DialogShell onClose={onClose} width="max-w-3xl">
      {loading || !source ? (
        <div className="flex h-48 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {sourceKind(source) === "website" ? (
              <Globe2 className="size-5 text-[hsl(var(--primary))]" />
            ) : sourceKind(source) === "qa" ? (
              <HelpCircle className="size-5 text-[hsl(var(--primary))]" />
            ) : (
              <FileText className="size-5 text-[hsl(var(--primary))]" />
            )}
            <h2 className="text-xl font-semibold">{sourceTitle(source)}</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-[hsl(var(--muted-foreground))]">
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status={source.status} />
              {source.status}
            </span>
            <span>{source.documentCount} total pages</span>
            <span>{source.chunkCount} chunks</span>
            <span>Started {formatDate(source.createdAt)}</span>
          </div>
          {urls.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold">Source URLs ({urls.length})</h3>
              <div className="space-y-2">
                {urls.map((url) => (
                  <div
                    key={url}
                    className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
                  >
                    <Globe2 className="size-4 text-[hsl(var(--muted-foreground))]" />
                    <span className="truncate text-[hsl(var(--primary))]">{url}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {sourceKind(source) === "qa" && source.config.questions ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Questions</h3>
              {source.config.questions.map((question) => (
                <div
                  key={question}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
                >
                  {question}
                </div>
              ))}
              {source.config.answer ? (
                <p className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-3 text-sm leading-6">
                  {source.config.answer}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold">Crawled Pages ({documents.length})</h3>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.url ?? document.title}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      {document.title}
                    </p>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </DialogShell>
  );
}

function DialogError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-red-400">
      <AlertCircle className="size-4" />
      {error.message}
    </p>
  );
}
