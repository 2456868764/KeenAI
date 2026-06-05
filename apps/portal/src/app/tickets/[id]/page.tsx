"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type PortalTicket, getPortalTicket } from "../../../lib/api";
import { getPortalSession } from "../../../lib/auth-store";

export default function PortalTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const [orgSlug, setOrgSlug] = useState("demo");
  const [ticket, setTicket] = useState<PortalTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getPortalSession();
    if (session?.orgSlug) setOrgSlug(session.orgSlug);

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const body = await getPortalTicket(orgSlug, ticketId, {
          token: session?.accessToken ?? null,
          customerId: session?.customerId,
        });
        setTicket(body.ticket);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        setTicket(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [orgSlug, ticketId]);

  return (
    <main>
      <p>
        <Link href="/">← All tickets</Link>
      </p>
      <h1>Ticket detail</h1>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {ticket ? (
        <article>
          <h2>{ticket.title}</h2>
          <p className="muted">
            {ticket.statusName ?? "No status"}
            {ticket.priority ? ` · ${ticket.priority}` : ""}
          </p>
          <p className="muted">
            Created {new Date(ticket.createdAt).toLocaleString()}
            {ticket.closedAt ? ` · Closed ${new Date(ticket.closedAt).toLocaleString()}` : ""}
          </p>
          <p className="muted">Last updated {new Date(ticket.updatedAt).toLocaleString()}</p>
        </article>
      ) : null}
    </main>
  );
}
