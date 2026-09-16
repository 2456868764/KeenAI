"use client";

import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@keenai/ui";
import { KeyRound, Paperclip, Plus } from "lucide-react";

export default function McpSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Paperclip className="size-5 text-[hsl(var(--primary))]" />
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">MCP</h1>
              <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
                NEW
              </span>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Connect model context protocol servers for tools, data access, and internal actions.
            </p>
          </div>
          <Button size="sm">
            <Plus className="size-4" />
            Add server
          </Button>
        </div>

        <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
              <KeyRound className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                No MCP servers configured
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Add a server endpoint and credentials when the MCP backend connection flow is ready.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
