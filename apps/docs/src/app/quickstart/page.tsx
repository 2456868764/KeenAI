import Link from "next/link";

const steps = [
  {
    title: "1. Clone & install",
    body: "git clone … && cd KeenAI && pnpm install",
  },
  {
    title: "2. Migrate & seed",
    body: "pnpm db:migrate && pnpm seed",
  },
  {
    title: "3. Start dev",
    body: "pnpm dev — API :8090 · Dashboard :3000",
  },
  {
    title: "4. Smoke test",
    body: "pnpm smoke (separate terminal after seed)",
  },
  {
    title: "5. Docker lite",
    body: "docker compose --profile lite up --build",
  },
];

export default function QuickstartPage() {
  return (
    <main>
      <h1>Quickstart</h1>
      <p className="lead">
        Five-minute path to a running KeenAI workspace (v0.2.0 Phase 1). Full detail in{" "}
        <a
          href="https://github.com/2456868764/KeenAI/blob/main/docs/ALPHA.md"
          target="_blank"
          rel="noreferrer"
        >
          ALPHA.md
        </a>
        .
      </p>

      <ol>
        {steps.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>

      <section>
        <h2>5-minute walkthrough</h2>
        <p className="lead">
          Video walkthrough ships with the public Alpha release. Until then, follow the steps above
          or the{" "}
          <a
            href="https://github.com/2456868764/KeenAI/blob/main/docs/ALPHA.md"
            target="_blank"
            rel="noreferrer"
          >
            ALPHA.md
          </a>{" "}
          guide.
        </p>
      </section>

      <footer>
        <p>
          <Link href="/">← Docs hub</Link>
        </p>
        <p>
          Email deliverability:{" "}
          <a
            href="https://github.com/2456868764/KeenAI/blob/main/docs/DKIM.md"
            target="_blank"
            rel="noreferrer"
          >
            DKIM.md
          </a>
        </p>
      </footer>
    </main>
  );
}
