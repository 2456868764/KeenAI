import type { ApiEnv } from "@keenai/shared";
import pino from "pino";

export function createLogger(env: ApiEnv) {
  const usePretty = env.LOG_FORMAT === "pretty" && env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL,
    ...(env.LOG_FORMAT === "json" ? { formatters: { level: (label) => ({ level: label }) } } : {}),
    transport: usePretty ? { target: "pino-pretty", options: { colorize: true } } : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
