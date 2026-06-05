import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createSlaPolicySchema,
  updateSlaPolicySchema,
  upsertOfficeHoursSchema,
} from "@keenai/shared";
import { slaPolicies } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  createSlaPolicy,
  evaluateConversationSla,
  getOfficeHoursForOrg,
  listSlaBreachesForConversation,
  listSlaPolicies,
  upsertOfficeHours,
} from "../lib/sla.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function slaRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/sla`;

  r.get(`${prefix}/policies`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const items = await listSlaPolicies(c.get("store").db, auth.orgId);
    return c.json({ items });
  });

  r.post(
    `${prefix}/policies`,
    requireAuth(),
    zValidator("json", createSlaPolicySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const policy = await createSlaPolicy(c.get("store").db, {
        orgId: auth.orgId,
        ...body,
      });
      return c.json({ policy }, 201);
    },
  );

  r.patch(
    `${prefix}/policies/:id`,
    requireAuth(),
    zValidator("json", updateSlaPolicySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const [existing] = await c
        .get("store")
        .db.select()
        .from(slaPolicies)
        .where(and(eq(slaPolicies.id, c.req.param("id")), eq(slaPolicies.orgId, auth.orgId)))
        .limit(1);

      if (!existing) return c.json({ error: "not_found" }, 404);

      const [row] = await c
        .get("store")
        .db.update(slaPolicies)
        .set({
          name: body.name ?? existing.name,
          firstResponseSec:
            body.firstResponseSec === undefined ? existing.firstResponseSec : body.firstResponseSec,
          resolutionSec:
            body.resolutionSec === undefined ? existing.resolutionSec : body.resolutionSec,
          operationalHoursOnly:
            body.operationalHoursOnly === undefined
              ? existing.operationalHoursOnly
              : body.operationalHoursOnly,
          enabled: body.enabled === undefined ? existing.enabled : body.enabled,
          updatedAt: new Date(),
        })
        .where(eq(slaPolicies.id, existing.id))
        .returning();

      if (!row) return c.json({ error: "update_failed" }, 500);
      return c.json({
        policy: {
          id: row.id,
          orgId: row.orgId,
          name: row.name,
          firstResponseSec: row.firstResponseSec ?? null,
          resolutionSec: row.resolutionSec ?? null,
          operationalHoursOnly: row.operationalHoursOnly ?? false,
          enabled: row.enabled ?? true,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    },
  );

  r.get(`${prefix}/office-hours`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const hours = await getOfficeHoursForOrg(c.get("store").db, auth.orgId);
    return c.json({ hours });
  });

  r.put(
    `${prefix}/office-hours`,
    requireAuth(),
    zValidator("json", upsertOfficeHoursSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const hours = await upsertOfficeHours(c.get("store").db, {
        orgId: auth.orgId,
        timezone: body.timezone,
        schedule: body.schedule,
        holidays: body.holidays,
      });
      return c.json({ hours });
    },
  );

  r.get(`${prefix}/conversations/:id/breaches`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const breaches = await listSlaBreachesForConversation(
      c.get("store").db,
      c.req.param("id"),
      auth.orgId,
    );
    return c.json({
      items: breaches.map((b) => ({
        id: b.id,
        metric: b.metric,
        thresholdPct: b.thresholdPct,
        dueAt: b.dueAt.toISOString(),
        breachedAt: b.breachedAt.toISOString(),
      })),
    });
  });

  r.post(`${prefix}/conversations/:id/evaluate`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const result = await evaluateConversationSla(c.get("store").db, {
      orgId: auth.orgId,
      conversationId: c.req.param("id"),
    });
    return c.json(result);
  });

  return r;
}
