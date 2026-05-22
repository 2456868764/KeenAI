"use client";

import { useEffect, useState } from "react";
import { type PortalTicket, listPortalTickets, requestPortalMagicLink } from "../lib/api";
import { clearPortalSession, getPortalSession } from "../lib/auth-store";

export default function PortalTicketsPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<PortalTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    const session = getPortalSession();
    if (session?.orgSlug === orgSlug) {
      setSessionEmail(session.customerId);
      void loadWithToken(session.orgSlug, session.accessToken);
    }
  }, [orgSlug]);

  async function loadWithToken(slug: string, token: string) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const body = await listPortalTickets(slug, { token });
      setItems(body.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setItems(null);
    try {
      await requestPortalMagicLink(orgSlug, email.trim());
      setInfo("Check your email for a sign-in link. In dev, see API logs for the URL.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadPublicDev(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setItems(null);
    try {
      const body = await listPortalTickets(orgSlug, { customerId: email.trim(), token: null });
      setItems(body.items);
      setInfo("Loaded via public read (requires PORTAL_PUBLIC_READ=true on API).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    clearPortalSession();
    setSessionEmail(null);
    setItems(null);
    setInfo(null);
    setError(null);
  }

  return (
    <main>
      <h1>My tickets</h1>
      <p className="muted">Customer portal — sign in with a magic link to view your tickets.</p>

      {sessionEmail ? (
        <p className="muted">
          Signed in as {sessionEmail}.{" "}
          <button
            type="button"
            onClick={signOut}
            style={{ background: "transparent", color: "var(--accent)", padding: 0 }}
          >
            Sign out
          </button>
        </p>
      ) : null}

      {!sessionEmail ? (
        <form onSubmit={sendMagicLink}>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send sign-in link"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={loadPublicDev}
            style={{ marginLeft: "0.5rem", background: "#71717a" }}
          >
            Dev: view without login
          </button>
        </form>
      ) : null}

      {info ? <p className="muted">{info}</p> : null}
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
