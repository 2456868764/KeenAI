"use client";

import { AppHeader } from "@/components/layout/app-header";
import {
  type TicketEvent,
  type TicketStatus,
  getTicket,
  listTicketEvents,
  listTicketStatuses,
  transitionTicketStatus,
  updateTicket,
} from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function TicketDetailShell({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => getTicket(ticketId),
  });

  const { data: statusesData } = useQuery({
    queryKey: ["ticket-statuses"],
    queryFn: listTicketStatuses,
  });

  const { data: eventsData } = useQuery({
    queryKey: ["ticket-events", ticketId],
    queryFn: () => listTicketEvents(ticketId),
  });

  const ticket = data?.ticket;
  const statuses = statusesData?.items ?? [];
  const events = eventsData?.items ?? [];

  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    if (ticket) setTitleDraft(ticket.title);
  }, [ticket]);

  const statusChange = useMutation({
    mutationFn: (statusId: string) => transitionTicketStatus(ticketId, statusId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-events", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const saveTitle = useMutation({
    mutationFn: (title: string) => updateTicket(ticketId, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Ticket">
        <Link
          href="/tickets"
          className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
        >
          Back to list
        </Link>
      </AppHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading ticket…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : !ticket ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Ticket not found</p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusSelect
                  value={ticket.statusId}
                  statuses={statuses}
                  disabled={statusChange.isPending}
                  onChange={(statusId) => statusChange.mutate(statusId)}
                />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {ticket.typeName ?? "Ticket"}
                  {ticket.priority ? ` · ${ticket.priority}` : ""}
                </span>
              </div>

              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = titleDraft.trim();
                  if (!title || title === ticket.title || saveTitle.isPending) return;
                  saveTitle.mutate(title);
                }}
              >
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="flex-1 text-base font-semibold"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={saveTitle.isPending || titleDraft.trim() === ticket.title}
                >
                  {saveTitle.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </form>

              <dl className="grid grid-cols-2 gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                <div>
                  <dt className="uppercase tracking-wide">Assignee</dt>
                  <dd className="mt-0.5 text-[hsl(var(--foreground))]">
                    {ticket.assigneeId ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide">Updated</dt>
                  <dd className="mt-0.5 text-[hsl(var(--foreground))]">
                    {new Date(ticket.updatedAt).toLocaleString()}
                  </dd>
                </div>
                {ticket.closedAt ? (
                  <div>
                    <dt className="uppercase tracking-wide">Closed</dt>
                    <dd className="mt-0.5 text-[hsl(var(--foreground))]">
                      {new Date(ticket.closedAt).toLocaleString()}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {ticket.conversationIds.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {ticket.conversationIds.map((conversationId) => (
                    <Link
                      key={conversationId}
                      href={`/inbox?c=${conversationId}`}
                      className="text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      View conversation
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium">Activity</h3>
              {events.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No events yet.</p>
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
                  {events.map((event) => (
                    <EventRow key={event.id} event={event} statuses={statuses} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusSelect({
  value,
  statuses,
  disabled,
  onChange,
}: {
  value: string | null;
  statuses: TicketStatus[];
  disabled: boolean;
  onChange: (statusId: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="text-[hsl(var(--muted-foreground))]">Status</span>
      <select
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-2 py-1 text-xs text-[hsl(var(--foreground))]"
        value={value ?? ""}
        disabled={disabled || statuses.length === 0}
        onChange={(e) => {
          const next = e.target.value;
          if (next && next !== (value ?? "")) onChange(next);
        }}
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function EventRow({ event, statuses }: { event: TicketEvent; statuses: TicketStatus[] }) {
  const label = formatEventLabel(event, statuses);
  return (
    <li className="px-4 py-3 text-sm">
      <p className="text-[hsl(var(--foreground))]">{label}</p>
      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
        {new Date(event.createdAt).toLocaleString()}
      </p>
    </li>
  );
}

function formatEventLabel(event: TicketEvent, statuses: TicketStatus[]): string {
  if (event.eventType === "status_changed") {
    const payload = event.payload as { toStatusId?: string } | null;
    const status = statuses.find((s) => s.id === payload?.toStatusId);
    return status ? `Status changed to ${status.name}` : "Status changed";
  }
  if (event.eventType === "created_from_conversation") return "Created from conversation";
  if (event.eventType === "created") return "Ticket created";
  return event.eventType.replaceAll("_", " ");
}
