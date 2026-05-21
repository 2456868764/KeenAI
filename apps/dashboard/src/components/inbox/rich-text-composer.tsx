"use client";

import type { Macro } from "@/lib/api";
import { uploadFile, uploadFileUrl } from "@/lib/api";
import type { Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2, Paperclip, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@keenai/ui";
import { createMentionSuggestion, createSlashSuggestion } from "./tiptap-suggestions";

export type RichTextPayload = {
  plainText: string;
  doc: Record<string, unknown>;
};

type Member = { id: string; name: string };

const MacroSlash = Mention.extend({ name: "macroSlash" });

export function RichTextComposer({
  placeholder,
  disabled,
  members,
  macros,
  externalText,
  onExternalTextApplied,
  onSubmit,
}: {
  placeholder: string;
  disabled?: boolean;
  members: Member[];
  macros: Macro[];
  externalText?: string;
  onExternalTextApplied?: () => void;
  onSubmit: (payload: RichTextPayload) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const mentionSuggestion = useMemo(() => createMentionSuggestion(members), [members]);
  const slashSuggestion = useMemo(() => createSlashSuggestion(macros), [macros]);

  const submit = useCallback(
    (ed: Editor) => {
      if (disabled) return;
      const plainText = ed.getText().trim();
      if (!plainText) return;
      onSubmit({ plainText, doc: ed.getJSON() as Record<string, unknown> });
      ed.commands.clearContent();
    },
    [disabled, onSubmit],
  );

  const insertImage = useCallback(async (file: File) => {
    const ed = editorRef.current;
    if (!ed || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const { storageKey } = await uploadFile(file);
      const src = uploadFileUrl(storageKey);
      if (!src) return;
      ed.chain().focus().setImage({ src, alt: file.name }).run();
    } finally {
      setUploading(false);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: true }),
      Mention.configure({
        HTMLAttributes: {
          class: "rounded bg-[hsl(var(--primary)/0.15)] px-1 text-[hsl(var(--primary))]",
        },
        suggestion: mentionSuggestion,
      }),
      MacroSlash.configure({
        suggestion: slashSuggestion,
      }),
    ],
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          const ed = editorRef.current;
          if (ed) submit(ed);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file?.type.startsWith("image/")) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
      handlePaste: (_view, event) => {
        const file = event.clipboardData?.files?.[0];
        if (!file?.type.startsWith("image/")) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (editor && externalText) {
      editor.commands.setContent(externalText);
      onExternalTextApplied?.();
    }
  }, [editor, externalText, onExternalTextApplied]);

  return (
    <div className="flex flex-1 gap-2">
      <div className="flex min-h-[2.75rem] flex-1 flex-col rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-[hsl(var(--primary))]">
        <EditorContent
          editor={editor}
          className="flex-1 outline-none [&_.ProseMirror]:min-h-[1.5rem] [&_.ProseMirror]:outline-none [&_.ProseMirror_img]:max-h-48 [&_.ProseMirror_img]:rounded [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[hsl(var(--muted-foreground))] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        />
        <div className="mt-1 flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void insertImage(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-1))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            title="Attach image"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          </button>
        </div>
      </div>
      <Button
        type="button"
        disabled={disabled || !editor?.getText().trim()}
        onClick={() => {
          if (editor) submit(editor);
        }}
      >
        {disabled ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </div>
  );
}
