"use client";

import { getHelpArticle, updateHelpArticle } from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HelpArticleToolbar } from "./help-article-toolbar";
import { hcTiptapExtensions } from "./tiptap-hc-extensions";

export function HelpArticleEditor({ articleId }: { articleId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["help-article", articleId],
    queryFn: () => getHelpArticle(articleId),
  });

  const article = data?.article;
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      ...hcTiptapExtensions,
      Placeholder.configure({ placeholder: "Write your help article…" }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[280px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!article || !editor) return;
    setTitle(article.title);
    setSlug(article.slug);
    setExcerpt(article.excerpt ?? "");
    setSeoTitle(article.seoTitle ?? "");
    setSeoDescription(article.seoDescription ?? "");
    if (article.content && Object.keys(article.content).length > 0) {
      editor.commands.setContent(article.content);
    } else if (article.plainText) {
      editor.commands.setContent(article.plainText);
    }
  }, [article, editor]);

  const save = useMutation({
    mutationFn: () => {
      if (!editor) throw new Error("editor_missing");
      return updateHelpArticle(articleId, {
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        plainText: editor.getText(),
        content: editor.getJSON() as Record<string, unknown>,
        status: "draft",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["help-article", articleId] });
      void queryClient.invalidateQueries({ queryKey: ["help-articles"] });
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("editor_missing");
      await updateHelpArticle(articleId, {
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        plainText: editor.getText(),
        content: editor.getJSON() as Record<string, unknown>,
        status: "published",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["help-article", articleId] });
      void queryClient.invalidateQueries({ queryKey: ["help-articles"] });
    },
  });

  if (isLoading || !article) {
    return <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Loading article…</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-red-400">{error.message}</p>;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/help-center"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← Help Center
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{article.status}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={save.isPending || publish.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save draft"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || publish.isPending}
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
          </Button>
        </div>
      </div>

      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="URL slug" />
      <Input
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        placeholder="Short excerpt (portal + SEO)"
      />

      <HelpArticleToolbar editor={editor} />
      <EditorContent editor={editor} />

      <div className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-4">
        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">SEO</p>
        <Input
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder="SEO title (optional)"
        />
        <textarea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          rows={2}
          placeholder="SEO description (optional)"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
