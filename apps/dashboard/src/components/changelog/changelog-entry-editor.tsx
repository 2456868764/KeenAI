"use client";

import {
  type ChangelogAudienceFilter,
  type ChangelogAudienceSegment,
  type ChangelogEntry,
  deleteChangelogEntry,
  getChangelogEntry,
  updateChangelogEntry,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CATEGORY_TAGS: ChangelogEntry["categoryTags"][number][] = ["new", "improved", "fixed"];

const emptySegment = (): ChangelogAudienceSegment => ({ name: "" });

export function ChangelogEntryEditor({ entryId }: { entryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["changelog-entry", entryId],
    queryFn: () => getChangelogEntry(entryId),
  });

  const entry = data?.entry;
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [categoryTags, setCategoryTags] = useState<ChangelogEntry["categoryTags"]>([]);
  const [segments, setSegments] = useState<ChangelogAudienceSegment[]>([]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write your changelog update…" }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[240px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!entry || !editor) return;
    setTitle(entry.title);
    setSlug(entry.slug);
    setSummary(entry.summary ?? "");
    setCategoryTags(entry.categoryTags);
    setSegments(entry.audienceFilter.segments);
    if (entry.content && Object.keys(entry.content).length > 0) {
      editor.commands.setContent(entry.content);
    } else if (entry.plainText) {
      editor.commands.setContent(entry.plainText);
    }
  }, [entry, editor]);

  const audienceFilter = (): ChangelogAudienceFilter => ({
    segments: segments.filter((segment) => segment.name.trim()),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!editor) throw new Error("editor_missing");
      return updateChangelogEntry(entryId, {
        title: title.trim(),
        slug: slug.trim(),
        summary: summary.trim() || null,
        plainText: editor.getText(),
        content: editor.getJSON() as Record<string, unknown>,
        categoryTags,
        audienceFilter: audienceFilter(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["changelog-entry", entryId] });
      void queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("editor_missing");
      await updateChangelogEntry(entryId, {
        title: title.trim(),
        slug: slug.trim(),
        summary: summary.trim() || null,
        plainText: editor.getText(),
        content: editor.getJSON() as Record<string, unknown>,
        categoryTags,
        audienceFilter: audienceFilter(),
      });
      return updateChangelogEntry(entryId, { status: "published" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["changelog-entry", entryId] });
      void queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteChangelogEntry(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["changelog-entries"] });
      router.replace("/changelog");
    },
  });

  function toggleTag(tag: ChangelogEntry["categoryTags"][number]) {
    setCategoryTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
    );
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Loading entry…</p>;
  }
  if (error || !entry) {
    return <p className="p-6 text-sm text-red-400">{error?.message ?? "Entry not found"}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/changelog"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
        >
          ← Back to changelog
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="mr-1 size-3.5" />
            Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save draft"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={publish.isPending}
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
          </Button>
        </div>
      </div>

      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
      <Input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Short summary"
      />

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={
              categoryTags.includes(tag)
                ? "rounded-full bg-[hsl(var(--primary))] px-3 py-1 text-xs text-[hsl(var(--primary-foreground))]"
                : "rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs"
            }
          >
            {tag}
          </button>
        ))}
      </div>

      <EditorContent editor={editor} />

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Audience segments</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSegments((current) => [...current, emptySegment()])}
          >
            Add segment
          </Button>
        </div>
        <ul className="space-y-3">
          {segments.map((segment, index) => (
            <li
              key={`${segment.name}-${index}`}
              className="grid gap-2 rounded-md border border-[hsl(var(--border))] p-3 md:grid-cols-3"
            >
              <Input
                value={segment.name}
                placeholder="Segment name"
                onChange={(e) =>
                  setSegments((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, name: e.target.value } : row,
                    ),
                  )
                }
              />
              <select
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
                value={segment.plan ?? ""}
                onChange={(e) =>
                  setSegments((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            plan: (e.target.value || undefined) as ChangelogAudienceSegment["plan"],
                          }
                        : row,
                    ),
                  )
                }
              >
                <option value="">Any plan</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <Input
                value={(segment.countries ?? []).join(", ")}
                placeholder="Countries (DE, FR)"
                onChange={(e) =>
                  setSegments((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            countries: e.target.value
                              .split(",")
                              .map((code) => code.trim().toUpperCase())
                              .filter((code) => code.length === 2),
                          }
                        : row,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
