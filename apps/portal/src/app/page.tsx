"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type PortalTicket = {
  id: string;
  title: string;
  statusName: string | null;
  priority: string | null;
  updatedAt: string;
  closedAt: string | null;
};

export default function PortalTicketsPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<PortalTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadTickets(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setItems(null);

    const qs = new URLSearchParams({ customerId: customerId.trim() });
    try {
      const res = await fetch(
        `${API_URL}/api/v1/portal/${encodeURIComponent(orgSlug)}/tickets?${qs}`,
      );
      const body = (await res.json()) as { items?: PortalTicket[]; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>My tickets</h1>
      <p className="muted">Customer portal prototype — list tickets by workspace and email.</p>

      <form onSubmit={loadTickets}>
        <label htmlFor="org">Workspace</label>
        <input
          id="org"
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value)}
          placeholder="demo"
        />
        <label htmlFor="email">Your email</label>
        <input
          id="email"
          type="email"
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="you@example.com"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "View tickets"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {items ? (
        items.length === 0 ? (
          <p className="muted">No tickets found for this email.</p>
        ) : (
          <ul>
            {items.map((ticket) => (
              <li key={ticket.id}>
                <strong>{ticket.title}</strong>
                <div className="muted">
                  {ticket.statusName ?? "No status"}
                  {ticket.priority ? ` · ${ticket.priority}` : ""}
                  {ticket.closedAt ? " · closed" : ""}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </main>
  );
}
