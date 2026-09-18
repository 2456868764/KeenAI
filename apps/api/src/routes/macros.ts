import { zValidator } from "@hono/zod-validator";
import { DASHBOARD_API_PREFIX, createMacroSchema } from "@keenai/shared";
import { Hono } from "hono";
import { createOrgMacro, listOrgMacros } from "../lib/macros-store.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function macroRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();

  r.get(`${DASHBOARD_API_PREFIX}/macros`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const items = await listOrgMacros(c.get("store").db, auth.orgId);
    return c.json({ items });
  });

  r.post(
    `${DASHBOARD_API_PREFIX}/macros`,
    requireAuth(),
    zValidator("json", createMacroSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      try {
        const macro = await createOrgMacro(c.get("store").db, auth.orgId, body);
        return c.json({ macro }, 201);
      } catch (e) {
        if (e instanceof Error && e.message === "macro_exists") {
          return c.json({ error: "macro_exists" }, 409);
        }
        throw e;
      }
    },
  );

  return r;
}
