"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

type RoadmapColumn = { id: string; label: string };

type RoadmapItem = {
  id: string;
  title: string;
  description: string | null;
  columnId: string;
  eta: string | null;
};

export default function PortalRoadmapPage() {
  const [orgSlug, setOrgSlug] = useState("demo");
  const [columns, setColumns] = useState<RoadmapColumn[]>([]);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/public/${encodeURIComponent(orgSlug)}/roadmap/product/items`,
        );
        const body = (await res.json()) as {
          items?: RoadmapItem[];
          roadmap?: { columns: RoadmapColumn[] };
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setColumns(body.roadmap?.columns ?? []);
        setItems(body.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        setColumns([]);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [orgSlug]);

  const columnLabel = (columnId: string) =>
    columns.find((column) => column.id === columnId)?.label ?? columnId;

  return (
    <main>
      <h1>Product roadmap</h1>
      <p className="muted">Public roadmap (requires PORTAL_PUBLIC_READ on API).</p>

      <label htmlFor="org">Workspace</label>
      <input
        id="org"
        value={orgSlug}
        onChange={(e) => setOrgSlug(e.target.value)}
        placeholder="demo"
      />

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <div className="muted">
              {columnLabel(item.columnId)}
              {item.eta ? ` · ETA ${new Date(item.eta).toLocaleDateString()}` : ""}
            </div>
            {item.description ? <p>{item.description}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
