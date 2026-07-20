"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type KbSource,
  createKbFileUploadSource,
  createKbWebCrawlSource,
  fetchMe,
  listKbSources,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Globe2,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sourceTypeLabel(type: string): string {
  if (type === "file_upload") return "File upload";
  if (type === "web_crawl") return "URL crawl";
  return type.replace(/_/g, " ");
}

export function KnowledgeBaseShell() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlTitle, setCrawlTitle] = useState("");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const sourcesQuery = useQuery({
    queryKey: ["kb-sources", brandId],
    queryFn: () => listKbSources(brandId as string),
    enabled: Boolean(brandId),
  });

  const sources = sourcesQuery.data?.items ?? [];

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!brandId || !selectedFile) throw new Error("missing_file");
      const rawContent = shouldReadAsText(selectedFile)
        ? await readFileAsText(selectedFile)
        : await readFileAsDataUrl(selectedFile);
      return createKbFileUploadSource({
        brandId,
        title: fileTitle.trim() || selectedFile.name,
        fileName: selectedFile.name,
        contentType: contentTypeForFile(selectedFile),
        sizeBytes: selectedFile.size,
        rawContent,
      });
    },
    onSuccess: () => {
      setSelectedFile(null);
      setFileTitle("");
      void queryClient.invalidateQueries({ queryKey: ["kb-sources"] });
    },
  });

  const crawlMutation = useMutation({
    mutationFn: () => {
      if (!brandId || !crawlUrl.trim()) throw new Error("missing_url");
      return createKbWebCrawlSource({
        brandId,
        url: crawlUrl.trim(),
        title: crawlTitle.trim() || undefined,
      });
    },
    onSuccess: () => {
      setCrawlUrl("");
      setCrawlTitle("");
      void queryClient.invalidateQueries({ queryKey: ["kb-sources"] });
    },
  });

  const sourceStats = useMemo(
    () => ({
      total: sources.length,
      documents: sources.reduce((sum, source) => sum + source.documentCount, 0),
      chunks: sources.reduce((sum, source) => sum + source.chunkCount, 0),
      syncing: sources.filter((source) => source.status === "syncing").length,
    }),
    [sources],
  );

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Knowledge Base">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!brandId || sourcesQuery.isFetching}
          onClick={() => void sourcesQuery.refetch()}
        >
          {sourcesQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </AppHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        {!brandId ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brand context...</p>
        ) : (
          <>
            <StatsRow stats={sourceStats} />

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="size-4 text-[hsl(var(--primary))]" />
                  <h2 className="text-sm font-medium">Upload documents</h2>
                </div>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (selectedFile) uploadMutation.mutate();
                  }}
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
                      PDF, DOCX, Markdown or text
                    </span>
                    <input
                      type="file"
                      accept={ACCEPTED_DOCUMENT_TYPES}
                      className="block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-xs text-[hsl(var(--foreground))] file:mr-3 file:rounded-md file:border-0 file:bg-[hsl(var(--primary))] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[hsl(var(--primary-foreground))]"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        setFileTitle(file?.name ?? "");
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
                      Title
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                      value={fileTitle}
                      onChange={(event) => setFileTitle(event.target.value)}
                      placeholder="Document title"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={!selectedFile || uploadMutation.isPending}
                    className="w-full"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 size-4" />
                    )}
                    Upload and index
                  </Button>
                  <MutationMessage
                    error={uploadMutation.error}
                    success={uploadMutation.isSuccess ? "Document source queued." : null}
                  />
                </form>
              </section>

              <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Globe2 className="size-4 text-[hsl(var(--primary))]" />
                  <h2 className="text-sm font-medium">Crawl URL</h2>
                </div>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (crawlUrl.trim()) crawlMutation.mutate();
                  }}
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
                      URL
                    </span>
                    <input
                      type="url"
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                      value={crawlUrl}
                      onChange={(event) => setCrawlUrl(event.target.value)}
                      placeholder="https://docs.example.com/article"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
                      Title
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 text-sm"
                      value={crawlTitle}
                      onChange={(event) => setCrawlTitle(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={!crawlUrl.trim() || crawlMutation.isPending}
                    className="w-full"
                  >
                    {crawlMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Globe2 className="mr-2 size-4" />
                    )}
                    Crawl and index
                  </Button>
                  <MutationMessage
                    error={crawlMutation.error}
                    success={crawlMutation.isSuccess ? "URL source queued." : null}
                  />
                </form>
              </section>
            </div>

            <SourcesTable sources={sources} loading={sourcesQuery.isLoading} />
          </>
        )}
      </main>
    </div>
  );
}

function StatsRow({
  stats,
}: {
  stats: { total: number; documents: number; chunks: number; syncing: number };
}) {
  const cards = [
    { label: "Sources", value: stats.total },
    { label: "Documents", value: stats.documents },
    { label: "Chunks", value: stats.chunks },
    { label: "Syncing", value: stats.syncing },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 py-3"
        >
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{card.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[hsl(var(--foreground))]">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function MutationMessage({ error, success }: { error: Error | null; success: string | null }) {
  if (error) {
    return (
      <p className="flex items-center gap-2 text-xs text-red-400">
        <AlertCircle className="size-3.5" />
        {error.message}
      </p>
    );
  }
  if (!success) return null;
  return (
    <p className="flex items-center gap-2 text-xs text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      {success}
    </p>
  );
}

function SourcesTable({ sources, loading }: { sources: KbSource[]; loading: boolean }) {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
        <h2 className="text-sm font-medium">Sources</h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {loading ? "Loading..." : `${sources.length} total`}
        </span>
      </div>
      {sources.length === 0 ? (
        <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">
          No knowledge base sources yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-[hsl(var(--muted-foreground))]">
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Docs</th>
                <th className="px-4 py-3 text-right font-medium">Chunks</th>
                <th className="px-4 py-3 font-medium">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr
                  key={source.id}
                  className="border-b border-[hsl(var(--border))] last:border-b-0"
                >
                  <td className="max-w-[280px] truncate px-4 py-3 font-medium">
                    {source.name ?? "Untitled source"}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {sourceTypeLabel(source.type)}
                  </td>
                  <td className="px-4 py-3">
                    <SourceStatus source={source} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{source.documentCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{source.chunkCount}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {formatDate(source.lastSyncedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SourceStatus({ source }: { source: KbSource }) {
  const isSyncing = source.status === "syncing";
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-[hsl(var(--surface-2))] px-2 py-1 text-xs">
      {isSyncing ? <Loader2 className="size-3 animate-spin" /> : null}
      <span className="truncate capitalize">{source.error ?? source.status}</span>
    </span>
  );
}
