import { verifyAccessToken } from "@keenai/auth";
import { API_VERSION } from "@keenai/shared";
import type { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { subscribeNotifications } from "../lib/notification-bus.js";
import type { AppVariables } from "../types.js";

export function registerNotificationsWebSocket(app: Hono<{ Variables: AppVariables }>) {
  app.get(
    `/api/${API_VERSION}/notifications/ws`,
    upgradeWebSocket(async (c) => {
      const token = c.req.query("access_token");
      if (!token) {
        return { onOpen: (_e, ws) => ws.close(4401, "missing access_token") };
      }

      let auth: Awaited<ReturnType<typeof verifyAccessToken>>;
      try {
        auth = await verifyAccessToken(c.get("authConfig"), token);
      } catch {
        return { onOpen: (_e, ws) => ws.close(4401, "invalid token") };
      }

      const accountId = auth.sub;
      let unsubscribe: (() => void) | undefined;

      return {
        onOpen: (_e, ws) => {
          ws.send(JSON.stringify({ type: "connected", accountId }));
          unsubscribe = subscribeNotifications(accountId, (event) => {
            ws.send(JSON.stringify(event));
          });
        },
        onClose: () => {
          unsubscribe?.();
        },
      };
    }),
  );
}
