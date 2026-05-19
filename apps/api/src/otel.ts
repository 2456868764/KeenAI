import type { ApiEnv } from "@keenai/shared";
import type { Logger } from "./logger.js";

/** Minimal OTel hook — full SDK wiring lands in P0 Week 2 follow-up. */
export function initOtel(env: ApiEnv, log: Logger): void {
  if (!env.OTEL_ENABLED) return;
  log.info("OpenTelemetry enabled (placeholder — export to OTLP in Week 2)");
}
