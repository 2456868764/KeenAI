"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type MemoryDigest,
  type MemoryExplorerStats,
  type MemoryHotTopic,
  type MemorySearchHit,
  fetchMe,
  getMemoryDigest,
  getMemoryStats,
  searchMemory,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SearchScope = "all" | "conversation" | "customer" | "channel";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MemoryExplorerShell() {
  const [searchQ, setSearchQ] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [digestDate, setDigestDate] = useState(todayUtcDate());
  const submittedQ = searchQ.trim();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const brandId = me?.brandIds[0] ?? null;

  const statsQuery = useQuery({
    queryKey: ["memory-stats", brandId],
    queryFn: () => getMemoryStats(brandId as string),
    enabled: Boolean(brandId),
  });

  const digestQuery = useQuery({
    queryKey: ["memory-digest", brandId, digestDate],
    queryFn: () => getMemoryDigest(brandId as string, digestDate),
    enabled: Boolean(brandId),
    retry: false,
  });

  const searchQuery = useQuery({
    queryKey: ["memory-search", brandId, submittedQ, searchScope],
    queryFn: () =>
      searchMemory({
        brandId: brandId as string,
        q: submittedQ,
        scope: searchScope,
      }),
    enabled: Boolean(brandId) && submittedQ.length > 0,
  });

  const stats = statsQuery.data?.stats;
  const hotTopics = statsQuery.data?.hotTopics ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Memory Explorer">
        <span className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:inline">
          OpenHuman-style summary tree
        </span>
      </AppHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        {!brandId ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brand context…</p>
        ) : (
          <>
            <StatsRow stats={stats} loading={statsQuery.isLoading} />

            <div className="grid gap-6 lg:grid-cols-2">
              <DigestPanel
                date={digestDate}
                onDateChange={setDigestDate}
                digest={digestQuery.data?.digest}
                loading={digestQuery.isLoading}
                error={digestQuery.error instanceof Error ? digestQuery.error.message : null}
              />

              <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="size-4 text-[hsl(var(--primary))]" />
                  <h2 className="text-sm font-medium">Hot topics</h2>
                </div>
                {hotTopics.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    No hot customer topics yet. Topic trees appear when hotness crosses the
                    threshold.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {hotTopics.map((topic) => (
                      <HotTopicRow key={topic.userId} topic={topic} />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <SearchPanel
              q={searchQ}
              scope={searchScope}
              onQChange={setSearchQ}
              onScopeChange={setSearchScope}
              hits={searchQuery.data?.hits ?? []}
              loading={searchQuery.isLoading}
              submitted={submittedQ.length > 0}
            />
          </>
        )}
      </main>
    </div>
  );
}

function StatsRow({
  stats,
  loading,
}: {
  stats: MemoryExplorerStats | undefined;
  loading: boolean;
}) {
  const cards = useMemo(
    () => [
      { label: "Chunks", value: stats?.chunkCount ?? "—" },
      { label: "Sources", value: stats?.sourceCount ?? "—" },
      { label: "Topics", value: stats?.topicCount ?? "—" },
      { label: "Storage", value: stats ? formatBytes(stats.storageBytes) : "—" },
    ],
    [stats],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 py-3"
        >
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{card.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[hsl(var(--foreground))]">
            {loading ? "…" : card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function DigestPanel({
  date,
  onDateChange,
  digest,
  loading,
  error,
}: {
  date: string;
  onDateChange: (date: string) => void;
  digest: MemoryDigest | undefined;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Brand daily digest</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-xs"
        />
      </div>
      {loading ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Loading digest…</p>
      ) : error ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">No digest for {date}.</p>
      ) : digest ? (
        <div className="space-y-2 text-sm">
          {digest.title ? (
            <p className="font-medium text-[hsl(var(--foreground))]">{digest.title}</p>
          ) : null}
          <p className="text-[hsl(var(--foreground))]">{digest.summary}</p>
          {digest.keyEvents.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs text-[hsl(var(--muted-foreground))]">
              {digest.keyEvents.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HotTopicRow({ topic }: { topic: MemoryHotTopic }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-[hsl(var(--surface-0))] px-3 py-2 text-xs">
      <span className="truncate font-mono text-[hsl(var(--foreground))]">{topic.userId}</span>
      <span className="shrink-0 text-[hsl(var(--muted-foreground))]">
        score {topic.score.toFixed(1)} · {topic.messageCount7d} msg/7d
      </span>
    </li>
  );
}

function SearchPanel({
  q,
  scope,
  onQChange,
  onScopeChange,
  hits,
  loading,
  submitted,
}: {
  q: string;
  scope: SearchScope;
  onQChange: (q: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  hits: MemorySearchHit[];
  loading: boolean;
  submitted: boolean;
}) {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Search className="size-4 text-[hsl(var(--primary))]" />
        <h2 className="text-sm font-medium">Search memory</h2>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Search chunk bodies…"
          className="min-w-[200px] flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
        />
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as SearchScope)}
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-2 text-xs"
        >
          <option value="all">All scopes</option>
          <option value="conversation">Conversation</option>
          <option value="customer">Customer topic</option>
          <option value="channel">Channel (Slack/Telegram)</option>
        </select>
      </div>

      {!submitted ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Type a query to search ingested memory chunks.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <Loader2 className="size-3 animate-spin" />
          Searching…
        </div>
      ) : hits.length === 0 ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">No matches.</p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {hits.map((hit) => (
            <SearchHitRow key={hit.chunkId} hit={hit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchHitRow({ hit }: { hit: MemorySearchHit }) {
  return (
    <li className="space-y-1 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="rounded bg-[hsl(var(--surface-0))] px-1.5 py-0.5">{hit.scope}</span>
        <span>{hit.lifecycle}</span>
        {hit.fastScore != null ? <span>fast {hit.fastScore.toFixed(2)}</span> : null}
        {hit.fusedScore != null ? <span>fused {hit.fusedScore.toFixed(4)}</span> : null}
        {hit.ftsScore != null ? <span>fts {hit.ftsScore.toFixed(2)}</span> : null}
        {hit.vectorScore != null ? <span>vec {hit.vectorScore.toFixed(2)}</span> : null}
        <span>{new Date(hit.createdAt).toLocaleString()}</span>
      </div>
      <p className="line-clamp-2 text-[hsl(var(--foreground))]">{hit.snippet ?? hit.body}</p>
      {hit.conversationId ? (
        <Link
          href={`/inbox?conversation=${encodeURIComponent(hit.conversationId)}`}
          className="text-xs text-[hsl(var(--primary))] hover:underline"
        >
          Open conversation
        </Link>
      ) : null}
    </li>
  );
}
