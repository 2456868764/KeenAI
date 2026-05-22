import { zValidator } from "@hono/zod-validator";
import { queryBrandDailyDigest, queryConversationMemoryTree } from "@keenai/memory-tree";
import { API_VERSION, memoryDigestQuerySchema, memoryTreeQuerySchema } from "@keenai/shared";
import { Hono } from "hono";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function memoryRoutes(_ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/memory`;

  r.get(`${prefix}/tree`, requireAuth(), zValidator("query", memoryTreeQuerySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    if (query.scope !== "conversation") {
      return c.json({ error: "unsupported_scope" }, 400);
    }

    const db = c.get("store").db;
    const conversation = await getConversationForOrg(db, query.id, auth.orgId);
    if (!conversation) return c.json({ error: "conversation_not_found" }, 404);
    if (!canAccessBrand(auth, conversation.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const tree = await queryConversationMemoryTree(db, {
      orgId: auth.orgId,
      brandId: conversation.brandId,
      conversationId: conversation.id,
      mode: query.mode,
      level: query.level,
    });

    return c.json({ tree });
  });

  r.get(
    `${prefix}/digest`,
    requireAuth(),
    zValidator("query", memoryDigestQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const { brandId, date } = c.req.valid("query");
      if (!canAccessBrand(auth, brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const digest = await queryBrandDailyDigest(c.get("store").db, {
        orgId: auth.orgId,
        brandId,
        dateUtc: date,
      });

      if (!digest) return c.json({ error: "digest_not_found" }, 404);
      return c.json({ digest });
    },
  );

  return r;
}
