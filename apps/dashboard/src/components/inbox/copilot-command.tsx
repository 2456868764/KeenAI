"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@keenai/ui";
import { useEffect, useState } from "react";

export function CopilotCommand({
  open,
  onOpenChange,
  conversationId,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  onDraft: (text: string, meta: { providerId: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function runDraft(instruction?: string) {
    if (!conversationId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { streamCopilotDraft } = await import("@/lib/api");
      let text = "";
      const meta = await streamCopilotDraft(conversationId, instruction, (chunk) => {
        text += chunk;
      });
      onDraft(text.trim(), meta);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => onOpenChange(false)}
      onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Copilot"
      >
        <Command>
          <CommandInput placeholder="Copilot — draft reply, or type an instruction…" />
          <CommandList>
            <CommandEmpty>{loading ? "Generating draft…" : "No results"}</CommandEmpty>
            <CommandGroup heading="AI Copilot">
              <CommandItem
                disabled={!conversationId || loading}
                onSelect={() => void runDraft()}
              >
                Draft reply
              </CommandItem>
              <CommandItem
                disabled={!conversationId || loading}
                onSelect={() => void runDraft("Be more empathetic and concise")}
              >
                Draft — empathetic & concise
              </CommandItem>
            </CommandGroup>
            {error ? (
              <p className="px-3 py-2 text-xs text-red-500">{error}</p>
            ) : null}
            {!conversationId ? (
              <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                Select a conversation first
              </p>
            ) : null}
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
