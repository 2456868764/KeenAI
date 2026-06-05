import type { ApiEnv } from "@keenai/shared";
import type { Logger } from "./logger.js";

let otelStarted = false;
let sentryStarted = false;

export async function initOtel(env: ApiEnv, log: Logger): Promise<void> {
  if (!env.OTEL_ENABLED || otelStarted) return;
  if (env.NODE_ENV === "test") return;

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    log.warn("OTEL_ENABLED but OTEL_EXPORTER_OTLP_ENDPOINT unset — skipping SDK");
    return;
  }

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { Resource } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");

    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
    });

    await sdk.start();
    otelStarted = true;
    log.info({ endpoint, service: env.OTEL_SERVICE_NAME }, "OpenTelemetry SDK started (OTLP HTTP)");
  } catch (err) {
    log.error({ err }, "OpenTelemetry SDK failed to start");
  }
}

export function initSentry(env: ApiEnv, log: Logger): void {
  if (!env.SENTRY_DSN || sentryStarted) return;
  if (env.NODE_ENV === "test") return;

  void (async () => {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
      });
      sentryStarted = true;
      log.info("Sentry SDK initialized");
    } catch (err) {
      log.error({ err }, "Sentry SDK failed to start");
    }
  })();
}
