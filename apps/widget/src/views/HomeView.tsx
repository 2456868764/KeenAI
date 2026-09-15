import type { WidgetConfig } from "../types.js";

type HomeViewProps = {
  config: WidgetConfig | null;
  onStartChat: () => void;
};

export function HomeView({ config, onStartChat }: HomeViewProps) {
  const quickActions = config?.quickActions ?? [
    { id: "start-chat", label: "Ask a question", type: "start_chat" as const },
    { id: "submit-ticket", label: "Submit ticket", type: "submit_ticket" as const },
    { id: "bug-report", label: "Bug report", type: "submit_ticket" as const },
  ];

  return (
    <div className="keenai-home">
      <section className="keenai-hero">
        <div className="keenai-avatar" aria-hidden="true">
          {config?.brand.logoUrl ? <img src={config.brand.logoUrl} alt="" /> : "K"}
        </div>
        <h2>{config?.agent.greetingTitle ?? "Hey! How can we help?"}</h2>
        <p>{config?.agent.greetingBody ?? "Ask a question, submit a ticket, or browse help."}</p>
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
    </div>
  );
}
