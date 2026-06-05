"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type HelpCollection,
  createHelpArticle,
  createHelpCollection,
  ensureDefaultHelpCollection,
  fetchMe,
  listHelpArticles,
  listHelpCollections,
  searchKb,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FolderPlus, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function HelpCenterShell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const submitted = q.trim();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const { data: collectionsData, isLoading: collectionsLoading } = useQuery({
    queryKey: ["help-collections", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      await ensureDefaultHelpCollection(brandId as string);
      return listHelpCollections(brandId as string);
    },
  });

  const collections = collectionsData?.items ?? [];
  const activeCollectionId = selectedCollectionId ?? collections[0]?.id ?? null;

  const { data: articlesData, isLoading: articlesLoading } = useQuery({
    queryKey: ["help-articles", brandId, activeCollectionId],
    enabled: Boolean(brandId && activeCollectionId),
    queryFn: () =>
      listHelpArticles({
        brandId: brandId as string,
        collectionId: activeCollectionId as string,
      }),
  });

  const search = useMutation({
    mutationFn: () => searchKb({ brandId: brandId as string, q: submitted, limit: 10 }),
  });

  const createCollection = useMutation({
    mutationFn: () => {
      const name = newCollectionName.trim();
      if (!brandId || !name) throw new Error("missing_fields");
      return createHelpCollection({
        brandId,
        slug: slugify(name),
        name,
      });
    },
    onSuccess: () => {
      setNewCollectionName("");
      void queryClient.invalidateQueries({ queryKey: ["help-collections"] });
    },
  });

  const createArticle = useMutation({
    mutationFn: async () => {
      if (!brandId || !activeCollectionId) throw new Error("missing_fields");
      const title = "Untitled article";
      const { article } = await createHelpArticle({
        brandId,
        collectionId: activeCollectionId,
        slug: `article-${Date.now().toString(36)}`,
        title,
        plainText: "",
        content: { type: "doc", content: [] },
      });
      return article;
    },
    onSuccess: (article) => {
      void queryClient.invalidateQueries({ queryKey: ["help-articles"] });
      router.push(`/help-center/articles/${article.id}`);
    },
  });

  const hits = search.data?.results.hits ?? [];
  const articles = articlesData?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Help Center" />

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden p-6">
        <aside className="w-56 shrink-0 space-y-3 overflow-y-auto">
          <p className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
            <BookOpen className="size-3.5" />
            Collections
          </p>
          {collectionsLoading ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {collections.map((collection: HelpCollection) => (
                <li key={collection.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCollectionId(collection.id)}
                    className={
                      activeCollectionId === collection.id
                        ? "w-full rounded-md bg-[hsl(var(--surface-2))] px-2 py-1.5 text-left text-xs font-medium"
                        : "w-full rounded-md px-2 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-1))]"
                    }
                  >
                    {collection.name}
                    <span className="ml-1 text-[hsl(var(--muted-foreground))]">
                      ({collection.articleCount ?? 0})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="space-y-2 border-t border-[hsl(var(--border))] pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCollectionName.trim()) createCollection.mutate();
            }}
          >
            <input
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-2 py-1.5 text-xs"
              placeholder="New collection"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={createCollection.isPending}>
              <FolderPlus className="mr-1 size-3.5" />
              Add
            </Button>
          </form>
        </aside>

        <section className="min-w-0 flex-1 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Articles</h2>
            <Button
              type="button"
              size="sm"
              disabled={!activeCollectionId || createArticle.isPending}
              onClick={() => createArticle.mutate()}
            >
              {createArticle.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="mr-1 size-4" />
                  New article
                </>
              )}
            </Button>
          </div>

          {articlesLoading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading articles…</p>
          ) : articles.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No articles in this collection yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {articles.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/help-center/articles/${article.id}`}
                    className="block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-4 py-3 hover:bg-[hsl(var(--surface-2))]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{article.title}</span>
                      <span className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                        {article.status}
                      </span>
                    </div>
                    {article.excerpt ? (
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {article.excerpt}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[hsl(var(--border))] pt-4">
            <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
              KB search (published articles sync to search index on publish). Public portal:{" "}
              <code className="text-[10px]">/help</code>
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

            <ul className="mt-4 space-y-2">
              {hits.map((hit) => (
                <li
                  key={hit.chunkId}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-3"
                >
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    score {hit.fusedScore.toFixed(3)} · {hit.documentTitle}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{hit.snippet ?? hit.content}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
