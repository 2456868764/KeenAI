"use client";

import type { Macro } from "@/lib/api";
import type { Editor } from "@tiptap/react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { MentionList, type MentionListRef } from "./mention-list";

type Member = { id: string; name: string };

function buildSuggestion<T extends { id: string; label: string }>(
  char: string,
  items: (query: string) => T[],
  onSelectExtra?: (item: T, editor: Editor) => void,
): Omit<SuggestionOptions<T>, "editor"> {
  return {
    char,
    allowSpaces: char === "/",
    items: ({ query }) => items(query),
    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate(props) {
          component?.updateProps(props);
          if (!props.clientRect || !popup?.[0]) return;
          popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
        },
        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
    command: ({ editor, range, props }) => {
      const item = props as T & { body?: string };
      if (char === "/" && item.body) {
        editor.chain().focus().deleteRange(range).insertContent(`${item.body} `).run();
        onSelectExtra?.(item, editor);
        return;
      }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [{ type: "mention", attrs: { id: item.id, label: item.label } }])
        .insertContent(" ")
        .run();
    },
  };
}

export function createMentionSuggestion(members: Member[]) {
  const items = (query: string) =>
    members
      .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
      .map((m) => ({ id: m.id, label: m.name }));

  return buildSuggestion("@", items);
}

export function createSlashSuggestion(macros: Macro[]) {
  const items = (query: string) =>
    macros
      .filter(
        (m) =>
          m.slug.includes(query.toLowerCase()) ||
          m.name.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 8)
      .map((m) => ({ id: m.slug, label: `/${m.slug}`, body: m.body }));

  return buildSuggestion("/", items);
}
