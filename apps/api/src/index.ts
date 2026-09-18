import { API_PREFIX } from "@keenai/shared";
import { createLibsqlFtsStore, createLibsqlStore, ensureFtsSchema } from "@keenai/storage";
import { websocket } from "hono/bun";
import { createApp } from "./app.js";
import { loadEnv, toAuthConfig } from "./config.js";
import { startAgentAutoCloseScheduler } from "./lib/agent-auto-close-scheduler.js";
import { startAgentRecoveryScheduler } from "./lib/agent-recovery-scheduler.js";
import { startChannelConnectionSupervisor } from "./lib/channel-connection-supervisor.js";
import { startChannelRecoveryScheduler } from "./lib/channel-recovery-scheduler.js";
import { startEmailImapPollScheduler } from "./lib/email-imap-scheduler.js";
import { startWorkflowScanScheduler } from "./lib/workflow-scan-scheduler.js";
import { createLogger } from "./logger.js";
import { initOtel, initSentry } from "./otel.js";

const env = loadEnv();
const startedAt = new Date();
const log = createLogger(env);
const store = createLibsqlStore({ url: env.DATABASE_URL });
await ensureFtsSchema(store.client);
const fts = createLibsqlFtsStore(store.client);
const authConfig = toAuthConfig(env);

initSentry(env, log);
await initOtel(env, log);

const app = createApp({ store, fts, authConfig, env, log, startedAt });

if (env.NODE_ENV !== "test" && env.CHANNEL_CONNECTION_SCAN_INTERVAL_SECONDS > 0) {
  startChannelConnectionSupervisor(
    { store, fts, authConfig, env, log, startedAt },
    { intervalMs: env.CHANNEL_CONNECTION_SCAN_INTERVAL_SECONDS * 1_000 },
  );
  log.info(
    { intervalSeconds: env.CHANNEL_CONNECTION_SCAN_INTERVAL_SECONDS },
    "channel connection supervisor started",
  );
}

if (
  env.NODE_ENV !== "test" &&
  !env.INNGEST_EVENT_KEY &&
  env.CHANNEL_RECOVERY_INTERVAL_SECONDS > 0
) {
  startChannelRecoveryScheduler(
    { store, fts, authConfig, env, log, startedAt },
    env.CHANNEL_RECOVERY_INTERVAL_SECONDS,
  );
  log.info(
    { intervalSeconds: env.CHANNEL_RECOVERY_INTERVAL_SECONDS },
    "channel recovery scheduler started",
  );
}

if (env.NODE_ENV !== "test" && !env.INNGEST_EVENT_KEY && env.AGENT_RECOVERY_INTERVAL_MINUTES > 0) {
  startAgentRecoveryScheduler(
    { store, fts, authConfig, env, log, startedAt },
    env.AGENT_RECOVERY_INTERVAL_MINUTES,
  );
  log.info(
    { intervalMinutes: env.AGENT_RECOVERY_INTERVAL_MINUTES },
    "agent recovery scheduler started",
  );
}

if (
  env.NODE_ENV !== "test" &&
  !env.INNGEST_EVENT_KEY &&
  env.AGENT_AUTO_CLOSE_SCAN_INTERVAL_SECONDS > 0
) {
  startAgentAutoCloseScheduler(
    { store, fts, authConfig, env, log, startedAt },
    env.AGENT_AUTO_CLOSE_SCAN_INTERVAL_SECONDS,
  );
  log.info(
    { intervalSeconds: env.AGENT_AUTO_CLOSE_SCAN_INTERVAL_SECONDS },
    "agent auto-close scheduler started",
  );
}

if (env.NODE_ENV !== "test" && !env.INNGEST_EVENT_KEY && env.WORKFLOW_SCAN_INTERVAL_MINUTES > 0) {
  startWorkflowScanScheduler({ store, log, env, authConfig }, env.WORKFLOW_SCAN_INTERVAL_MINUTES);
  log.info(
    { intervalMinutes: env.WORKFLOW_SCAN_INTERVAL_MINUTES },
    "workflow unresponsive scan scheduler started",
  );
}

if (env.NODE_ENV !== "test" && !env.INNGEST_EVENT_KEY && env.EMAIL_IMAP_POLL_INTERVAL_MINUTES > 0) {
  startEmailImapPollScheduler(
    { store, fts, authConfig, env, log, startedAt },
    env.EMAIL_IMAP_POLL_INTERVAL_MINUTES,
  );
  log.info(
    { intervalMinutes: env.EMAIL_IMAP_POLL_INTERVAL_MINUTES },
    "email imap poll scheduler started",
  );
}

if (typeof Bun !== "undefined") {
  const { registerConversationWebSocket, registerConversationWebSocketAt } = await import(
    "./routes/conversations-ws.js"
  );
  const { registerNotificationsWebSocket, registerNotificationsWebSocketAt } = await import(
    "./routes/notifications-ws.js"
  );
  const { registerWidgetWebSocket } = await import("./routes/widget-ws.js");
  registerConversationWebSocket(app);
  registerConversationWebSocketAt(app, `${API_PREFIX}/conversations`);
  registerNotificationsWebSocket(app);
  registerNotificationsWebSocketAt(app, `${API_PREFIX}/notifications/ws`);
  registerWidgetWebSocket(app);
}

log.info({ port: env.PORT, db: env.DATABASE_URL }, "keenai-api starting");

// Bun --watch auto-starts from this export; do not call Bun.serve() again (EADDRINUSE on reload).
export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket,
  development: env.NODE_ENV !== "production",
};
