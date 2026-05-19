import { render } from "preact";
import { boot } from "./boot";

const params = new URLSearchParams(window.location.search);
const userId = params.get("userId") ?? "visitor-demo";
const userHash = params.get("userHash") ?? "";

function DevPreview() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui,sans-serif" }}>
      <h1>KeenAI Widget (dev)</h1>
      <p style={{ color: "#666", maxWidth: "40rem" }}>
        Run <code>pnpm seed</code> for a demo <code>userHash</code>, then open with{" "}
        <code>?userId=visitor-demo&amp;userHash=…</code>
      </p>
      <button
        type="button"
        disabled={!userHash}
        onClick={() =>
          boot({
            orgSlug: "demo",
            apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8090",
            user: { id: userId, userHash },
          }).open()
        }
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          borderRadius: "8px",
          border: "none",
          background: userHash ? "#7c3aed" : "#ccc",
          color: "#fff",
          cursor: userHash ? "pointer" : "not-allowed",
        }}
      >
        Open widget
      </button>
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<DevPreview />, root);
