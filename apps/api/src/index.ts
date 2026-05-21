import { createLibsqlFtsStore, createLibsqlStore, ensureFtsSchema } from "@keenai/storage";
import { websocket } from "hono/bun";
import { createApp } from "./app.js";
import { loadEnv, toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { initOtel } from "./otel.js";
import { startWorkflowScanScheduler } from "./lib/workflow-scan-scheduler.js";

const env = loadEnv();
const startedAt = new Date();
const log = createLogger(env);
const store = createLibsqlStore({ url: env.DATABASE_URL });
await ensureFtsSchema(store.client);
const fts = createLibsqlFtsStore(store.client);
const authConfig = toAuthConfig(env);

initOtel(env, log);

const app = createApp({ store, fts, authConfig, env, log, startedAt });

if (env.NODE_ENV !== "test" && !env.INNGEST_EVENT_KEY && env.WORKFLOW_SCAN_INTERVAL_MINUTES > 0) {
  startWorkflowScanScheduler({ store, log }, env.WORKFLOW_SCAN_INTERVAL_MINUTES);
  log.info(
    { intervalMinutes: env.WORKFLOW_SCAN_INTERVAL_MINUTES },
    "workflow unresponsive scan scheduler started",
  );
}

if (typeof Bun !== "undefined") {
  const { registerConversationWebSocket } = await import("./routes/conversations-ws.js");
  const { registerNotificationsWebSocket } = await import("./routes/notifications-ws.js");
  const { registerWidgetWebSocket } = await import("./routes/widget-ws.js");
  registerConversationWebSocket(app);
  registerNotificationsWebSocket(app);
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
