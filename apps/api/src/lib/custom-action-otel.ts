import { SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER_NAME = "keenai.custom-action";
const INVALID_TRACE_ID = "00000000000000000000000000000000";

export type CustomActionSpanHandle = {
  traceId: string | null;
  spanId: string | null;
  setAttribute: (key: string, value: string | number | boolean) => void;
  recordException: (error: Error) => void;
  end: () => void;
};

const noopSpan: CustomActionSpanHandle = {
  traceId: null,
  spanId: null,
  setAttribute: () => {},
  recordException: () => {},
  end: () => {},
};

function normalizeTraceId(traceId: string): string | null {
  return traceId && traceId !== INVALID_TRACE_ID ? traceId : null;
}

/** Start an OTel span for a custom action call (no-op when telemetry is disabled). */
export function startCustomActionSpan(
  enabled: boolean,
  name: string,
  attrs: Record<string, string | number | boolean>,
): CustomActionSpanHandle {
  if (!enabled) return noopSpan;

  const span = trace.getTracer(TRACER_NAME).startSpan(name);
  for (const [key, value] of Object.entries(attrs)) {
    span.setAttribute(key, value);
  }

  const { traceId, spanId } = span.spanContext();
  return {
    traceId: normalizeTraceId(traceId),
    spanId: spanId && spanId !== "0000000000000000" ? spanId : null,
    setAttribute: (key, value) => {
      span.setAttribute(key, value);
    },
    recordException: (error) => {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    },
    end: () => {
      span.end();
    },
  };
}
