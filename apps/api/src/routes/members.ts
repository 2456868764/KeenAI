import { API_VERSION } from "@keenai/shared";
import { accounts, members } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function memberRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();

  r.get(`/api/${API_VERSION}/members`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const rows = await c
      .get("store")
      .db.select({
        id: members.id,
        accountId: members.accountId,
        role: members.role,
        name: accounts.name,
        email: accounts.email,
      })
      .from(members)
      .innerJoin(accounts, eq(accounts.id, members.accountId))
      .where(eq(members.orgId, auth.orgId))
      .limit(100);

    return c.json({
      items: rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        role: row.role,
        name: row.name,
        email: row.email,
      })),
    });
  });

  return r;
}
