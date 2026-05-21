import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { BUILTIN_MACROS } from "../lib/macros.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function macroRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();

  r.get(`/api/${API_VERSION}/macros`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    return c.json({ items: BUILTIN_MACROS });
  });

  return r;
}
