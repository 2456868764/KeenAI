import { API_VERSION } from "@keenai/shared";
import { feedbackPosts, kbQueryLogs, tickets } from "@keenai/storage/schema";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function analyticsRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/analytics`;

  r.get(`${prefix}/summary`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const db = c.get("store").db;
    const orgId = auth.orgId;

    const [[ticketRow], [feedbackRow], [kbRow]] = await Promise.all([
      db.select({ n: count() }).from(tickets).where(eq(tickets.orgId, orgId)),
      db.select({ n: count() }).from(feedbackPosts).where(eq(feedbackPosts.orgId, orgId)),
      db.select({ n: count() }).from(kbQueryLogs).where(eq(kbQueryLogs.orgId, orgId)),
    ]);

    return c.json({
      support: { ticketCount: ticketRow?.n ?? 0 },
      feedback: { postCount: feedbackRow?.n ?? 0 },
      helpCenter: { searchCount: kbRow?.n ?? 0 },
    });
  });

  return r;
}
