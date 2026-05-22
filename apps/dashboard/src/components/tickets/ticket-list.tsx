"use client";

import { AppHeader } from "@/components/layout/app-header";
import { type Ticket, createTicket, listTickets } from "@/lib/api";
import { Button } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";

export function TicketListShell() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => listTickets(),
  });

  const create = useMutation({
    mutationFn: () => createTicket({ title: "New ticket" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tickets"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Tickets">
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 size-4" />
              New ticket
            </>
          )}
        </Button>
      </AppHeader>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading tickets…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-8 text-center">
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              No tickets yet. Create one manually or convert a conversation from the inbox.
            </p>
            <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
              Create ticket
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
            {items.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const linkedConversation = ticket.conversationIds[0];

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Link
          href={`/tickets/${ticket.id}`}
          className="font-medium text-[hsl(var(--foreground))] hover:underline"
        >
          {ticket.title}
        </Link>
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {ticket.statusName ?? "No status"}
          {ticket.priority ? ` · ${ticket.priority}` : ""}
          {ticket.typeName ? ` · ${ticket.typeName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {linkedConversation ? (
          <Link
            href={`/inbox?c=${linkedConversation}`}
            className="text-xs text-[hsl(var(--primary))] hover:underline"
          >
            View conversation
          </Link>
        ) : null}
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          {new Date(ticket.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </li>
  );
}
