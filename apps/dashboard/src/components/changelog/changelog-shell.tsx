"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type ChangelogEntry,
  createChangelogEntry,
  fetchMe,
  listChangelogEntries,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function statusLabel(entry: ChangelogEntry) {
  if (entry.status === "published") return "Published";
  if (entry.status === "scheduled") return "Scheduled";
  return "Draft";
}

export function ChangelogShell() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["changelog-entries", brandId],
    enabled: Boolean(brandId),
    queryFn: () => listChangelogEntries({ brandId: brandId as string }),
  });

  const create = useMutation({
    mutationFn: () => {
      const title = "Untitled update";
      return createChangelogEntry({
        brandId: brandId as string,
        slug: `update-${Date.now().toString(36)}`,
        title,
        plainText: "",
        content: { type: "doc", content: [] },
      });
    },
    onSuccess: ({ entry }) => {
      void queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
      router.push(`/changelog/${entry.id}`);
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Changelog">
        <Button size="sm" disabled={create.isPending || !brandId} onClick={() => create.mutate()}>
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="mr-1 size-4" />
          )}
          New entry
        </Button>
      </AppHeader>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">
        <p className="mb-4 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <Megaphone className="size-4" />
          Publish product updates with audience segments for email targeting.
        </p>

        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading entries…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No changelog entries yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/changelog/${entry.id}`}
                  className="block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4 transition-colors hover:bg-[hsl(var(--surface-2))]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{entry.title}</p>
                      {entry.summary ? (
                        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                          {entry.summary}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        /{entry.slug}
                        {entry.categoryTags.length > 0 ? ` · ${entry.categoryTags.join(", ")}` : ""}
                        {entry.audienceFilter.segments.length > 0
                          ? ` · ${entry.audienceFilter.segments.length} segment(s)`
                          : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-xs">
                      {statusLabel(entry)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
