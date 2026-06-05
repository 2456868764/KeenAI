import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { getAnalyticsDashboard } from "../lib/analytics.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function analyticsRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/analytics`;

  r.get(`${prefix}/summary`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const dashboard = await getAnalyticsDashboard(c.get("store").db, auth.orgId);
    return c.json({
      support: {
        ticketCount: dashboard.support.ticketCount,
        openCount: dashboard.support.openCount,
        doneCount: dashboard.support.doneCount,
      },
      feedback: {
        postCount: dashboard.feedback.postCount,
        totalUpvotes: dashboard.feedback.totalUpvotes,
      },
      helpCenter: {
        searchCount: dashboard.helpCenter.searchCount,
        publishedArticles: dashboard.helpCenter.publishedArticles,
      },
    });
  });

  r.get(`${prefix}/dashboard`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const dashboard = await getAnalyticsDashboard(c.get("store").db, auth.orgId);
    return c.json({ dashboard });
  });

  return r;
}
