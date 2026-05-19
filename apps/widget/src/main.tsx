import { render } from "preact";
import { boot } from "./boot";

function DevPreview() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui,sans-serif" }}>
      <h1>KeenAI Widget (dev)</h1>
      <p style={{ color: "#666" }}>
        Embed via <code>KeenAI.boot(&#123; orgSlug: &quot;demo&quot; &#125;)</code>
      </p>
      <button
        type="button"
        onClick={() => boot({ orgSlug: "demo", theme: "dark" }).open()}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          borderRadius: "8px",
          border: "none",
          background: "#7c3aed",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Open widget
      </button>
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<DevPreview />, root);
