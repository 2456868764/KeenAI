"use client";

import type { Macro } from "@/lib/api";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
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
  const mentionSuggestion = useMemo(() => createMentionSuggestion(members), [members]);
  const slashSuggestion = useMemo(() => createSlashSuggestion(macros), [macros]);

  const submit = useCallback(
    (ed: NonNullable<ReturnType<typeof useEditor>>) => {
      if (!ed || disabled) return;
      const plainText = ed.getText().trim();
      if (!plainText) return;
      onSubmit({ plainText, doc: ed.getJSON() as Record<string, unknown> });
      ed.commands.clearContent();
    },
    [disabled, onSubmit],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder }),
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
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          submit(view.editor);
          return true;
        }
        return false;
      },
    },
  });

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
          className="flex-1 outline-none [&_.ProseMirror]:min-h-[1.5rem] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[hsl(var(--muted-foreground))] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        />
      </div>
      <Button
        type="button"
        disabled={disabled || !editor?.getText().trim()}
        onClick={() => submit(editor)}
      >
        {disabled ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </div>
  );
}
