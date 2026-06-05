"use client";

import { AppHeader } from "@/components/layout/app-header";
import { fetchMe, searchKb } from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Search } from "lucide-react";
import { useState } from "react";

export function HelpCenterShell() {
  const [q, setQ] = useState("");
  const submitted = q.trim();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const search = useMutation({
    mutationFn: () => searchKb({ brandId: brandId as string, q: submitted, limit: 10 }),
  });

  const hits = search.data?.results.hits ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Help Center" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <p className="mb-4 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <BookOpen className="size-4" />
          KB-backed search. Public articles live at portal <code className="text-xs">/help</code>{" "}
          via <code className="text-xs">GET /api/v1/public/…/kb/articles</code>.
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (brandId && submitted) search.mutate();
          }}
        >
          <input
            className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 py-2 text-sm"
            placeholder="Search help articles…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!brandId || !submitted || search.isPending}>
            {search.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Search className="mr-1 size-4" />
                Search
              </>
            )}
          </Button>
        </form>

        {search.error && (
          <p className="mt-4 text-sm text-red-400">{(search.error as Error).message}</p>
        )}

        {search.data && (
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            logId: {search.data.logId}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {hits.map((hit) => (
            <li
              key={hit.chunkId}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
            >
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                score {hit.fusedScore.toFixed(3)} · {hit.documentTitle}
              </p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{hit.snippet ?? hit.content}</p>
            </li>
          ))}
        </ul>

        {search.isSuccess && hits.length === 0 && (
          <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">No results.</p>
        )}
      </main>
    </div>
  );
}
