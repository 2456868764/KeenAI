import { useState } from "preact/hooks";

type TicketViewProps = {
  type: string;
  onSubmit: (input: { type: string; title: string; description: string }) => Promise<void>;
};

export function TicketView({ type, onSubmit }: TicketViewProps) {
  const [title, setTitle] = useState(type === "bug" ? "Bug report" : "");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  async function submit(event: Event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription || status === "submitting") return;

    setStatus("submitting");
    try {
      await onSubmit({ type, title: cleanTitle, description: cleanDescription });
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  }

  if (status === "submitted") {
    return (
      <div className="keenai-empty-state">
        <h2>Ticket submitted</h2>
        <p>The team will review it from the inbox.</p>
      </div>
    );
  }

  return (
    <form className="keenai-ticket-form" onSubmit={submit}>
      <label>
        <span>Title</span>
        <input
          value={title}
          maxLength={240}
          placeholder="What happened?"
          onInput={(event) => setTitle(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={description}
          maxLength={20_000}
          placeholder="Share the details..."
          onInput={(event) => setDescription(event.currentTarget.value)}
        />
      </label>
      {status === "error" ? <p className="keenai-form-error">Could not submit ticket.</p> : null}
      <button
        type="submit"
        className="keenai-primary-button"
        disabled={!title.trim() || !description.trim() || status === "submitting"}
      >
        {status === "submitting" ? "Submitting..." : "Submit ticket"}
      </button>
    </form>
  );
}
