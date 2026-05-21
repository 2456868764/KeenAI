import { verifyAccessToken } from "@keenai/auth";
import { API_VERSION } from "@keenai/shared";
import type { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { subscribeConversation } from "../lib/conversation-bus.js";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import type { AppVariables } from "../types.js";

/** Bun-only WebSocket route; register from `index.ts` when `Bun` is available. */
export function registerConversationWebSocket(app: Hono<{ Variables: AppVariables }>) {
  const prefix = `/api/${API_VERSION}/conversations`;

  app.get(
    `${prefix}/:id/ws`,
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

      const conversationId = c.req.param("id");
      if (!conversationId) {
        return { onOpen: (_e, ws) => ws.close(4400, "missing conversation id") };
      }

      const conversation = await getConversationForOrg(
        c.get("store").db,
        conversationId,
        auth.orgId,
      );
      if (!conversation || !canAccessBrand(auth, conversation.brandId)) {
        return { onOpen: (_e, ws) => ws.close(4403, "forbidden") };
      }

      let unsubscribe: (() => void) | undefined;

      return {
        onOpen: (_e, ws) => {
          ws.send(JSON.stringify({ type: "connected", conversationId }));
          unsubscribe = subscribeConversation(conversationId, (event) => {
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
