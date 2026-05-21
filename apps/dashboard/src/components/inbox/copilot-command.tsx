"use client";

import { listCopilotProviders, type CopilotProvider } from "@/lib/api";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@keenai/ui";
import { useQuery } from "@tanstack/react-query";
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
  const [providerId, setProviderId] = useState<string>("stub");

  const { data: providersData } = useQuery({
    queryKey: ["copilot-providers"],
    queryFn: listCopilotProviders,
    enabled: open,
  });

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  useEffect(() => {
    if (providersData?.defaultProviderId) {
      setProviderId(providersData.defaultProviderId);
    }
  }, [providersData?.defaultProviderId, open]);

  async function runDraft(instruction?: string) {
    if (!conversationId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { streamCopilotDraft } = await import("@/lib/api");
      let text = "";
      const meta = await streamCopilotDraft(
        conversationId,
        instruction,
        (chunk) => {
          text += chunk;
        },
        providerId,
      );
      onDraft(text.trim(), meta);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const providers: CopilotProvider[] = providersData?.items ?? [];

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
          <div className="border-b border-[hsl(var(--border))] px-3 py-2">
            <label
              htmlFor="copilot-provider"
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
            >
              Model provider
            </label>
            <select
              id="copilot-provider"
              value={providerId}
              disabled={loading || providers.length === 0}
              onChange={(e) => setProviderId(e.target.value)}
              className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-2 text-xs text-[hsl(var(--foreground))]"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.model ? ` · ${p.model}` : ""}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
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
