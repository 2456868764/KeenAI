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
  OPENAI_WHISPER_MODEL: z.string().default("whisper-1"),
  /** STT provider: stub | openai (auto: openai when OPENAI_API_KEY set, else stub) */
  STT_PROVIDER: z.enum(["stub", "openai"]).optional(),
  /** TTS provider: stub | openai (auto: openai when OPENAI_API_KEY set, else stub) */
  TTS_PROVIDER: z.enum(["stub", "openai"]).optional(),
  OPENAI_TTS_MODEL: z.string().default("tts-1"),
  OPENAI_TTS_VOICE: z.string().default("alloy"),
  /** Image generation provider: stub | openai (auto: openai when OPENAI_API_KEY set, else stub) */
  IMAGE_GEN_PROVIDER: z.enum(["stub", "openai"]).optional(),
  OPENAI_IMAGE_MODEL: z.string().default("dall-e-3"),
  /** Telegram Bot API token for IM webhooks and media download */
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  /** Slack Bot token for IM webhooks and media download */
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  /** Video/image thumbnail provider: stub | ffmpeg */
  THUMBNAIL_PROVIDER: z.enum(["stub", "ffmpeg"]).optional(),
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
  /** Inngest event key — when set, workflow triggers are queued via Inngest */
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_APP_ID: z.string().default("keenai"),
  /** Inngest cron for customer_unresponsive scan (default every 5 minutes) */
  INNGEST_SCAN_CRON: z.string().default("*/5 * * * *"),
  /** Sync-mode background scan interval in minutes (0 = disabled; ignored when Inngest is enabled) */
  WORKFLOW_SCAN_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
  /** IMAP polling — stub until imapflow worker is wired */
  EMAIL_IMAP_HOST: z.string().optional(),
  EMAIL_IMAP_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_IMAP_USER: z.string().optional(),
  EMAIL_IMAP_PASS: z.string().optional(),
  EMAIL_IMAP_MAILBOX: z.string().default("INBOX"),
  /** Sync-mode IMAP poll interval in minutes (0 = disabled; ignored when Inngest is enabled) */
  EMAIL_IMAP_POLL_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
  /** Inngest cron for IMAP poll (default every 5 minutes) */
  INNGEST_IMAP_POLL_CRON: z.string().default("*/5 * * * *"),
  /** Org/brand slugs for IMAP ingest target */
  EMAIL_IMAP_ORG_SLUG: z.string().optional(),
  EMAIL_IMAP_BRAND_SLUG: z.string().default("default"),
  /** Allow unauthenticated portal ticket reads (set true in dev via .env) */
  PORTAL_PUBLIC_READ: z.coerce.boolean().default(false),
  /** Customer portal app URL for magic links */
  PORTAL_APP_URL: z.string().url().default("http://localhost:3002"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
  opts?: { fromModuleUrl?: string },
): ApiEnv {
  const merged = { ...env };
  merged.DATABASE_URL = resolveDatabaseUrl(merged.DATABASE_URL, opts?.fromModuleUrl);
  ensureDatabaseDirectory(merged.DATABASE_URL);
  const parsed = apiEnvSchema.parse(merged);
  if (merged.PORTAL_PUBLIC_READ === undefined && parsed.NODE_ENV !== "production") {
    return { ...parsed, PORTAL_PUBLIC_READ: true };
  }
  return parsed;
}
