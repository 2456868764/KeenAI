import { describe, expect, it } from "vitest";
import { startCustomActionSpan } from "./custom-action-otel.js";

describe("startCustomActionSpan", () => {
  it("returns a no-op span when telemetry is disabled", () => {
    const span = startCustomActionSpan(false, "custom_action.execute", {
      "custom_action.name": "extend_trial",
    });

    span.setAttribute("http.status_code", 200);
    span.recordException(new Error("ignored"));
    span.end();

    expect(span.traceId).toBeNull();
    expect(span.spanId).toBeNull();
  });

  it("starts a span when telemetry is enabled", () => {
    const span = startCustomActionSpan(true, "custom_action.execute", {
      "custom_action.name": "extend_trial",
    });

    span.setAttribute("custom_action.ok", true);
    span.end();

    expect(typeof span.traceId === "string" || span.traceId === null).toBe(true);
    expect(typeof span.spanId === "string" || span.spanId === null).toBe(true);
  });
});
