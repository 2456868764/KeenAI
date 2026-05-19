import { createLibsqlStore } from "@keenai/storage";
import { websocket } from "hono/bun";
import { createApp } from "./app.js";
import { loadEnv, toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { initOtel } from "./otel.js";

const env = loadEnv();
const startedAt = new Date();
const log = createLogger(env);
const store = createLibsqlStore({ url: env.DATABASE_URL });
const authConfig = toAuthConfig(env);

initOtel(env, log);

const app = createApp({ store, authConfig, env, log, startedAt });

if (typeof Bun !== "undefined") {
  const { registerConversationWebSocket } = await import("./routes/conversations-ws.js");
  const { registerWidgetWebSocket } = await import("./routes/widget-ws.js");
  registerConversationWebSocket(app);
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
