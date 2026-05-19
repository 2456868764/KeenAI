import { type AuthConfig, parseTtlSeconds } from "@keenai/auth";
import { type ApiEnv, parseApiEnv } from "@keenai/shared";

export function loadEnv(): ApiEnv {
  return parseApiEnv(process.env, { fromModuleUrl: import.meta.url });
}

export function toAuthConfig(env: ApiEnv): AuthConfig {
  return {
    jwtSecret: env.JWT_SECRET,
    accessTtlSec: parseTtlSeconds(env.JWT_ACCESS_TTL, 900),
    refreshTtlSec: parseTtlSeconds(env.JWT_REFRESH_TTL, 604_800),
    appUrl: env.APP_URL,
    smtp:
      env.SMTP_HOST && env.SMTP_FROM
        ? {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT ?? 587,
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
            from: env.SMTP_FROM,
          }
        : undefined,
  };
}
