import { zValidator } from "@hono/zod-validator";
import { DASHBOARD_API_PREFIX, updateAgentOtherSettingsSchema } from "@keenai/shared";
import { Hono } from "hono";
import { getOrCreateAgentOtherSettings, updateAgentOtherSettings } from "../lib/agent-settings.js";
import { reconcileAutoCloseJobsForSettings } from "../lib/conversation-auto-close.js";
import { assertBrandInOrg, canAccessBrand } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function agentSettingsRoutes() {
  const routes = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/agent-settings`;

  routes.get(`${prefix}/:brandId`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const brandId = c.req.param("brandId");
    if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
    const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const settings = await getOrCreateAgentOtherSettings(c.get("store").db, {
      orgId: auth.orgId,
      brandId,
    });
    return c.json({ settings });
  });

  routes.patch(
    `${prefix}/:brandId`,
    requireAuth(),
    zValidator("json", updateAgentOtherSettingsSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const brandId = c.req.param("brandId");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      const settings = await updateAgentOtherSettings(c.get("store").db, {
        orgId: auth.orgId,
        brandId,
        patch: c.req.valid("json"),
      });
      await reconcileAutoCloseJobsForSettings(c.get("store").db, settings);
      return c.json({ settings });
    },
  );

  return routes;
}
