import type { WidgetConfig, WidgetHome } from "../types.js";

type HomeViewProps = {
  config: WidgetConfig | null;
  home: WidgetHome | null;
  onStartChat: () => void;
};

export function HomeView({ config, home, onStartChat }: HomeViewProps) {
  const quickActions = home?.quickActions ??
    config?.quickActions ?? [
      { id: "start-chat", label: "Ask a question", type: "start_chat" as const },
      { id: "submit-ticket", label: "Submit ticket", type: "submit_ticket" as const },
      { id: "bug-report", label: "Bug report", type: "submit_ticket" as const },
    ];
  const articles = home?.articles ?? [];
  const entries = home?.changelogEntries ?? [];

  return (
    <div className="keenai-home">
      <section className="keenai-hero">
        <div className="keenai-avatar" aria-hidden="true">
          {config?.brand.logoUrl ? <img src={config.brand.logoUrl} alt="" /> : "K"}
        </div>
        <h2>{home?.greeting.title ?? config?.agent.greetingTitle ?? "Hey! How can we help?"}</h2>
        <p>
          {home?.greeting.body ??
            config?.agent.greetingBody ??
            "Ask a question, submit a ticket, or browse help."}
        </p>
      </section>

      <section className="keenai-card-list" aria-label="Quick actions">
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="keenai-action-card"
            onClick={onStartChat}
          >
            <span>{action.label}</span>
            <strong>Open</strong>
          </button>
        ))}
      </section>

      <section className="keenai-search-card">
        <span>Search help center</span>
        <button type="button" onClick={onStartChat}>
          Ask AI
        </button>
      </section>

      {articles.length > 0 ? (
        <section className="keenai-home-section" aria-label="Recommended articles">
          <h3>Recommended articles</h3>
          {articles.slice(0, 3).map((article) => (
            <article key={article.id} className="keenai-content-card">
              <small>{article.collection}</small>
              <strong>{article.title}</strong>
              {article.excerpt ? <p>{article.excerpt}</p> : null}
            </article>
          ))}
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className="keenai-home-section" aria-label="Latest updates">
          <h3>Latest updates</h3>
          {entries.slice(0, 2).map((entry) => (
            <article key={entry.id} className="keenai-content-card">
              <small>Update</small>
              <strong>{entry.title}</strong>
              {entry.summary ? <p>{entry.summary}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
