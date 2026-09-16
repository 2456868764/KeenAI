"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type FeedbackDedupMatch,
  type FeedbackPost,
  createFeedbackPost,
  ensureDefaultFeedbackBoard,
  fetchMe,
  findFeedbackDuplicates,
  listFeedbackPosts,
} from "@/lib/api";
import { Button, cn } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  CalendarDays,
  ChevronRight,
  ChevronUp,
  Clock3,
  Filter,
  Image,
  Italic,
  Lightbulb,
  Link2,
  List,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Smile,
  Tag,
  UserCircle,
  Video,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const BOARD_SLUG = "ideas";

const statusLabels: Record<string, string> = {
  under_review: "Under Review",
  planned: "Planned",
  active: "Active",
  done: "Done",
  closed: "Closed",
};

export function FeedbackShell() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "popular">("recent");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const brandId = me?.brandIds[0] ?? null;

  const postsQuery = useQuery({
    queryKey: ["feedback-posts", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      await ensureDefaultFeedbackBoard(brandId as string);
      return listFeedbackPosts(BOARD_SLUG);
    },
  });

  const selectedStatus = searchParams.get("status");
  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const expectedStatus = selectedStatus ? statusLabels[selectedStatus] : null;
    const filtered = (postsQuery.data?.items ?? []).filter((post) => {
      const matchesStatus = expectedStatus
        ? normalizeStatus(post.statusName) === normalizeStatus(expectedStatus)
        : true;
      const matchesQuery = normalizedQuery
        ? `${post.title} ${post.plainText}`.toLowerCase().includes(normalizedQuery)
        : true;
      return matchesStatus && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "popular") {
        return b.upvoteCount - a.upvoteCount || b.createdAt.localeCompare(a.createdAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [postsQuery.data?.items, query, selectedStatus, sort]);

  const invalidatePosts = () =>
    void queryClient.invalidateQueries({ queryKey: ["feedback-posts"] });

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title={`Posts (${items.length})`}>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {searchOpen ? (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts"
              className="h-9 w-52 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          ) : null}
          <ToolbarButton
            label="Search"
            icon={Search}
            onClick={() => setSearchOpen((open) => !open)}
          />
          <ToolbarButton
            label="Filters"
            icon={Filter}
            active={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          />
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm font-medium text-[hsl(var(--muted-foreground))] shadow-sm">
            <Clock3 className="size-4" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "recent" | "popular")}
              className="min-w-36 bg-transparent text-[hsl(var(--foreground))] outline-none"
              aria-label="Sort feedback posts"
            >
              <option value="recent">Recent posts</option>
              <option value="popular">Most upvoted</option>
            </select>
          </label>
          <Button
            type="button"
            className="h-9 rounded-lg px-4 text-sm shadow-sm"
            disabled={!brandId}
            onClick={() => setComposerOpen(true)}
          >
            <Plus className="size-4" />
            Create Post
          </Button>
        </div>
      </AppHeader>

      {filtersOpen ? (
        <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          Showing{" "}
          {selectedStatus ? (statusLabels[selectedStatus] ?? selectedStatus) : "all statuses"}
          {query.trim() ? ` matching "${query.trim()}"` : ""}.
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {postsQuery.isLoading ? (
          <StateMessage icon={Loader2} label="Loading feedback..." spinning />
        ) : postsQuery.error ? (
          <StateMessage label={postsQuery.error.message} tone="danger" />
        ) : items.length === 0 ? (
          <StateMessage label="No feedback posts match this view." />
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {items.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </ul>
        )}
      </main>

      {composerOpen ? (
        <CreatePostDialog
          onClose={() => setComposerOpen(false)}
          onCreated={() => {
            invalidatePosts();
          }}
        />
      ) : null}
    </div>
  );
}

function PostRow({ post }: { post: FeedbackPost }) {
  return (
    <li className="grid min-h-16 grid-cols-[84px_minmax(0,1fr)_auto] items-start gap-5 px-8 py-5">
      <div className="flex items-center justify-end gap-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
        <ChevronUp className="size-4" />
        <span>{post.upvoteCount}</span>
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">
          {post.title}
        </h2>
        {post.plainText ? (
          <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">
            {post.plainText}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
        <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
        <Pill label="Feature Request" />
        <StatusPill label={post.statusName ?? "Open"} />
      </div>
    </li>
  );
}

function CreatePostDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [createMore, setCreateMore] = useState(false);
  const [duplicates, setDuplicates] = useState<FeedbackDedupMatch[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createFeedbackPost(BOARD_SLUG, {
        title: title.trim(),
        plainText: body.trim(),
        tags,
      }),
    onSuccess: () => {
      onCreated();
      if (createMore) {
        setTitle("");
        setBody("");
        setTagInput("");
        setTags([]);
        setDuplicates([]);
        return;
      }
      onClose();
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
      void findFeedbackDuplicates(BOARD_SLUG, {
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

  function addTag() {
    const next = tagInput.trim();
    if (!next || tags.includes(next)) return;
    setTags((current) => [...current, next].slice(0, 16));
    setTagInput("");
  }

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 text-sm backdrop-blur-[1px]">
      <form
        className="flex max-h-[62vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-sm shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex size-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <span className="size-4 rounded-full bg-current" />
            </div>
            <ChevronRight className="size-5 text-[hsl(var(--muted-foreground))]" />
            <Pill label="Feature Request" size="lg" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title of your post"
            className="w-full border-0 bg-transparent text-xl font-semibold tracking-normal text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/0.72)]"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Post description..."
            className="mt-5 min-h-28 w-full resize-none border-0 bg-transparent text-base leading-7 text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground)/0.72)]"
          />

          {checkingDupes || duplicates.length > 0 ? (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              {checkingDupes ? (
                <p className="text-amber-700">Checking for similar posts...</p>
              ) : (
                <>
                  <p className="font-semibold text-amber-800">Similar posts already exist</p>
                  <ul className="mt-2 space-y-2">
                    {duplicates.map((match) => (
                      <li key={match.post.id} className="text-[hsl(var(--foreground))]">
                        {match.post.title}
                        <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                          {Math.round(match.score * 100)}% match
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-4 text-[hsl(var(--muted-foreground))]">
            <ComposerTool icon={Image} label="Add image" />
            <ComposerToolText label="B" />
            <ComposerTool icon={Italic} label="Italic" />
            <ComposerTool icon={List} label="List" />
            <ComposerTool icon={Link2} label="Link" />
            <ComposerTool icon={Video} label="Video" />
            <ComposerTool icon={Smile} label="Emoji" />
            <ComposerTool icon={Paperclip} label="Attachment" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <MetaButton icon={AtSign} label="In Review" />
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 shadow-sm">
              <Tag className="size-4 text-[hsl(var(--muted-foreground))]" />
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Tag"
                className="h-5 w-16 bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
              />
            </div>
            <MetaButton icon={UserCircle} label="Owner" muted />
            <MetaButton icon={CalendarDays} label="Due" muted />
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                className="rounded-full bg-[hsl(var(--primary)/0.1)] px-3 py-1 text-sm font-medium text-[hsl(var(--primary))]"
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setCreateMore((current) => !current)}
              className="flex items-center gap-3 text-sm font-medium text-[hsl(var(--muted-foreground))]"
            >
              <span
                className={cn(
                  "h-6 w-11 rounded-full p-0.5 transition-colors",
                  createMore ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-3))]",
                )}
              >
                <span
                  className={cn(
                    "block size-5 rounded-full bg-[hsl(var(--surface-0))] shadow-sm transition-transform",
                    createMore && "translate-x-5",
                  )}
                />
              </span>
              Create more
            </button>
            <Button type="submit" className="h-10 rounded-xl px-5 text-sm" disabled={!canSubmit}>
              {create.isPending ? <Loader2 className="size-5 animate-spin" /> : null}
              Submit Post
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Search;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 text-sm font-semibold text-[hsl(var(--muted-foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
        active && "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]",
      )}
    >
      <Icon className="size-4" />
      {label === "Search" ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );
}

function Pill({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] font-semibold text-[hsl(var(--muted-foreground))] shadow-sm",
        size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1 text-sm",
      )}
    >
      <Lightbulb className="size-4 text-amber-300" />
      {label}
    </span>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-600">
      {label}
    </span>
  );
}

function MetaButton({
  icon: Icon,
  label,
  muted,
}: {
  icon: typeof Tag;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm font-semibold shadow-sm",
        muted ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--foreground))]",
      )}
    >
      <Icon
        className={cn("size-4", muted ? "text-[hsl(var(--muted-foreground))]" : "text-sky-400")}
      />
      {label}
    </button>
  );
}

function ComposerTool({ icon: Icon, label }: { icon: typeof Image; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-md p-1 hover:bg-[hsl(var(--surface-2))]"
    >
      <Icon className="size-5" />
    </button>
  );
}

function ComposerToolText({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-md px-1.5 py-1 text-lg font-semibold hover:bg-[hsl(var(--surface-2))]"
    >
      {label}
    </button>
  );
}

function StateMessage({
  label,
  icon: Icon,
  spinning,
  tone,
}: {
  label: string;
  icon?: typeof Loader2;
  spinning?: boolean;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]",
        tone === "danger" && "text-red-500",
      )}
    >
      {Icon ? <Icon className={cn("size-4", spinning && "animate-spin")} /> : null}
      {label}
    </div>
  );
}

function normalizeStatus(status: string | null | undefined) {
  return (status ?? "").replace(/[_-]/g, " ").trim().toLowerCase();
}

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(value));
}
