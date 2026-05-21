import { z } from "zod";
import { ensureDatabaseDirectory, resolveDatabaseUrl } from "./paths.js";

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8090),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32).default("dev-only-change-me-in-production-keenai-32"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  OTEL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  /** HMAC secret for Messenger widget Identity Verification */
  WIDGET_HMAC_SECRET: z.string().min(32).optional(),
  /** Local upload directory (default: `<repo>/data/uploads`) */
  UPLOAD_DIR: z.string().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /** Copilot provider: stub | openai | anthropic | deepseek | kimi | gemini | ollama (auto if unset) */
  LLM_PROVIDER: z
    .enum(["stub", "openai", "anthropic", "deepseek", "kimi", "gemini", "ollama"])
    .optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-haiku-latest"),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  KIMI_API_KEY: z.string().min(1).optional(),
  KIMI_MODEL: z.string().default("moonshot-v1-8k"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  /** Local Ollama OpenAI-compatible API (register provider when set) */
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().default("llama3.2"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
  opts?: { fromModuleUrl?: string },
): ApiEnv {
  const merged = { ...env };
  merged.DATABASE_URL = resolveDatabaseUrl(merged.DATABASE_URL, opts?.fromModuleUrl);
  ensureDatabaseDirectory(merged.DATABASE_URL);
  return apiEnvSchema.parse(merged);
}
