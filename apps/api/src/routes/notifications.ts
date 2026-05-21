import { zValidator } from "@hono/zod-validator";
import { API_VERSION, listNotificationsSchema } from "@keenai/shared";
import { notifications } from "@keenai/storage/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { serializeNotification } from "../lib/notifications.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function notificationRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/notifications`;

  r.get(prefix, requireAuth(), zValidator("query", listNotificationsSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const { unreadOnly, limit } = c.req.valid("query");
    const filters = [eq(notifications.accountId, auth.sub), eq(notifications.orgId, auth.orgId)];
    if (unreadOnly) filters.push(isNull(notifications.readAt));

    const rows = await c
      .get("store")
      .db.select()
      .from(notifications)
      .where(and(...filters))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const unread = await c
      .get("store")
      .db.select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.accountId, auth.sub),
          eq(notifications.orgId, auth.orgId),
          isNull(notifications.readAt),
        ),
      );

    return c.json({
      items: rows.map(serializeNotification),
      unreadCount: unread.length,
    });
  });

  r.patch(`${prefix}/:id/read`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const now = new Date();
    const [updated] = await c
      .get("store")
      .db.update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.id, c.req.param("id")),
          eq(notifications.accountId, auth.sub),
          eq(notifications.orgId, auth.orgId),
        ),
      )
      .returning();

    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ notification: serializeNotification(updated) });
  });

  r.post(`${prefix}/read-all`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const now = new Date();
    await c
      .get("store")
      .db.update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.accountId, auth.sub),
          eq(notifications.orgId, auth.orgId),
          isNull(notifications.readAt),
        ),
      );

    return c.json({ ok: true });
  });

  return r;
}
