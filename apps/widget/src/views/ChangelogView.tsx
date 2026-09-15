import type { WidgetChangelogEntry } from "../types.js";

type ChangelogViewProps = {
  entries: WidgetChangelogEntry[];
};

export function ChangelogView({ entries }: ChangelogViewProps) {
  return (
    <div className="keenai-list">
      {entries.length > 0 ? (
        entries.map((entry) => (
          <article key={entry.id} className="keenai-content-card">
            <small>{formatDate(entry.publishedAt ?? entry.updatedAt)}</small>
            <strong>{entry.title}</strong>
            {entry.summary ? <p>{entry.summary}</p> : null}
          </article>
        ))
      ) : (
        <article className="keenai-content-card">
          <small>Latest updates</small>
          <strong>No updates yet</strong>
          <p>New release notes and announcements are shown in this space.</p>
        </article>
      )}
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
