"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type Item = { id: string; label: string };

export const MentionList = forwardRef<
  MentionListRef,
  { items: Item[]; command: (item: Item) => void }
>(function MentionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-2 text-xs text-[hsl(var(--muted-foreground))] shadow-md">
        No matches
      </div>
    );
  }

  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-1 text-xs shadow-md">
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            className={`w-full rounded px-2 py-1.5 text-left ${
              i === selected
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "hover:bg-[hsl(var(--surface-2))]"
            }`}
            onClick={() => command(item)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
});
