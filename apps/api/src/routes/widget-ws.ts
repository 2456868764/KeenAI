import { verifyWidgetAccessToken } from "@keenai/auth";
import { API_VERSION } from "@keenai/shared";
import type { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { subscribeConversation } from "../lib/conversation-bus.js";
import { getConversationForOrg } from "../lib/conversations.js";
import { assertWidgetConversation } from "../lib/widget.js";
import type { AppVariables } from "../types.js";

/** Bun-only widget WebSocket; register from `index.ts` when `Bun` is available. */
export function registerWidgetWebSocket(app: Hono<{ Variables: AppVariables }>) {
  const prefix = `/api/${API_VERSION}/widget`;

  app.get(
    `${prefix}/conversations/:id/ws`,
    upgradeWebSocket(async (c) => {
      const token = c.req.query("widget_token");
      if (!token) {
        return { onOpen: (_e, ws) => ws.close(4401, "missing widget_token") };
      }

      let auth: Awaited<ReturnType<typeof verifyWidgetAccessToken>>;
      try {
        auth = await verifyWidgetAccessToken(c.get("authConfig"), token);
      } catch {
        return { onOpen: (_e, ws) => ws.close(4401, "invalid token") };
      }

      const conversationId = c.req.param("id");
      if (!conversationId) {
        return { onOpen: (_e, ws) => ws.close(4400, "missing conversation id") };
      }

      const conversation = await getConversationForOrg(
        c.get("store").db,
        conversationId,
        auth.orgId,
      );
      const denied = assertWidgetConversation(conversation, auth);
      if (denied || !conversation) {
        const code = denied === "not_found" || !conversation ? 4404 : 4403;
        const reason = denied === "not_found" || !conversation ? "not_found" : "forbidden";
        return { onOpen: (_e, ws) => ws.close(code, reason) };
      }

      const activeConversationId = conversation.id;
      let unsubscribe: (() => void) | undefined;

      return {
        onOpen: (_e, ws) => {
          ws.send(JSON.stringify({ type: "connected", conversationId: activeConversationId }));
          unsubscribe = subscribeConversation(activeConversationId, (event) => {
            if (
              event.type === "message.created" &&
              (event.message as { isInternal?: boolean })?.isInternal
            ) {
              return;
            }
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
