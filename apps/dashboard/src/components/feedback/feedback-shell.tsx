"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type FeedbackDedupMatch,
  createFeedbackPost,
  ensureDefaultFeedbackBoard,
  fetchMe,
  findFeedbackDuplicates,
  listFeedbackPosts,
} from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

export function FeedbackShell() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [duplicates, setDuplicates] = useState<FeedbackDedupMatch[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["feedback-posts", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      await ensureDefaultFeedbackBoard(brandId as string);
      return listFeedbackPosts("ideas");
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createFeedbackPost("ideas", {
        title: title.trim(),
        plainText: body.trim(),
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setDuplicates([]);
      void queryClient.invalidateQueries({ queryKey: ["feedback-posts"] });
    },
  });

  useEffect(() => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < 2 || trimmedBody.length < 8) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(() => {
      setCheckingDupes(true);
      void findFeedbackDuplicates("ideas", {
        title: trimmedTitle,
        plainText: trimmedBody,
        threshold: 0.72,
      })
        .then((result) => setDuplicates(result.matches))
        .catch(() => setDuplicates([]))
        .finally(() => setCheckingDupes(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [title, body]);

  const items = data?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Feedback" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <form
          className="mb-8 space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && body.trim()) create.mutate();
          }}
        >
          <input
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            placeholder="Feature title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
            rows={3}
            placeholder="Describe the idea…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {checkingDupes ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Checking for duplicates…</p>
          ) : null}

          {duplicates.length > 0 ? (
            <output className="block rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium text-amber-200">Similar ideas already exist</p>
              <ul className="mt-2 space-y-2">
                {duplicates.map((match) => (
                  <li key={match.post.id} className="text-[hsl(var(--foreground))]">
                    <span className="font-medium">{match.post.title}</span>
                    <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {Math.round(match.score * 100)}% · {match.method}
                    </span>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      ▲ {match.post.upvoteCount} votes — consider upvoting instead
                    </p>
                  </li>
                ))}
              </ul>
            </output>
          ) : null}

          <Button
            type="submit"
            size="sm"
            disabled={create.isPending || !title.trim() || !body.trim()}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="mr-1 size-4" />
            )}
            Submit idea
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading feedback…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((post) => (
              <li
                key={post.id}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{post.title}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                      {post.plainText}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                    ▲ {post.upvoteCount}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  {post.statusName ?? "Open"} · {post.commentCount} comments
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
