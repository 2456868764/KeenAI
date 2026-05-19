import { zValidator } from "@hono/zod-validator";
import { API_VERSION, searchConversationsSchema } from "@keenai/shared";
import { conversations } from "@keenai/storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { canAccessBrand, serializeConversation } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function searchRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/search`;

  r.get(
    `${prefix}/conversations`,
    requireAuth(),
    zValidator("query", searchConversationsSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      if (!ctx.fts) return c.json({ error: "fts_unavailable" }, 503);

      const { q, brandId, limit } = c.req.valid("query");
      const hits = await ctx.fts.search({
        orgId: auth.orgId,
        brandId,
        q,
        limit,
      });

      if (hits.length === 0) return c.json({ items: [] });

      const ids = hits.map((h) => h.id);
      const rows = await c
        .get("store")
        .db.select()
        .from(conversations)
        .where(and(eq(conversations.orgId, auth.orgId), inArray(conversations.id, ids)));

      const byId = new Map(rows.map((row) => [row.id, row]));
      const items = hits
        .map((hit) => {
          const row = byId.get(hit.id);
          if (!row || !canAccessBrand(auth, row.brandId)) return null;
          return {
            ...serializeConversation(row),
            snippet: hit.snippet,
            score: hit.score,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return c.json({ items });
    },
  );

  return r;
}
