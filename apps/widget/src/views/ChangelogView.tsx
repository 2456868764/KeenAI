import { useState } from "preact/hooks";
import type { WidgetChangelogEntry } from "../types.js";

type ChangelogViewProps = {
  entries: WidgetChangelogEntry[];
  onLoadEntry: (slug: string) => Promise<WidgetChangelogEntry>;
};

export function ChangelogView({ entries, onLoadEntry }: ChangelogViewProps) {
  const [selectedEntry, setSelectedEntry] = useState<WidgetChangelogEntry | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");

  async function openEntry(slug: string) {
    setDetailStatus("loading");
    try {
      const entry = await onLoadEntry(slug);
      setSelectedEntry(entry);
      setDetailStatus("idle");
    } catch {
      setDetailStatus("error");
    }
  }

  if (selectedEntry) {
    return (
      <article className="keenai-detail">
        <button type="button" className="keenai-text-button" onClick={() => setSelectedEntry(null)}>
          Back to updates
        </button>
        <small>{formatDate(selectedEntry.publishedAt ?? selectedEntry.updatedAt)}</small>
        <h2>{selectedEntry.title}</h2>
        {selectedEntry.summary ? <p>{selectedEntry.summary}</p> : null}
        {selectedEntry.plainText ? <p>{selectedEntry.plainText}</p> : null}
      </article>
    );
  }

  return (
    <div className="keenai-list">
      {entries.length > 0 ? (
        entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="keenai-content-card keenai-content-button"
            onClick={() => void openEntry(entry.slug)}
          >
            <small>{formatDate(entry.publishedAt ?? entry.updatedAt)}</small>
            <strong>{entry.title}</strong>
            {entry.summary ? <p>{entry.summary}</p> : null}
          </button>
        ))
      ) : (
        <article className="keenai-content-card">
          <small>Latest updates</small>
          <strong>No updates yet</strong>
          <p>New release notes and announcements are shown in this space.</p>
        </article>
      )}
      {detailStatus === "loading" ? (
        <p className="keenai-inline-status">Loading update...</p>
      ) : null}
      {detailStatus === "error" ? (
        <p className="keenai-form-error">Could not load update.</p>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Update";
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Update";
  }
}
