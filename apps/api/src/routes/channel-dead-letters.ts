import { zValidator } from "@hono/zod-validator";
import { replayChannelDeadLetter, resolveChannelDeadLetter } from "@keenai/channels-runtime";
import { DASHBOARD_API_PREFIX } from "@keenai/shared";
import { auditLogs, channelDeadLetters } from "@keenai/storage/schema";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { getChannelDispatch } from "../lib/channel-dispatch.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

const querySchema = z.object({
  status: z.enum(["open", "resolved", "all"]).default("open"),
  sourceType: z.enum(["ingress", "session", "delivery"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function channelDeadLetterRoutes() {
  const routes = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/channel-dead-letters`;

  routes.get(prefix, requireAuth(), zValidator("query", querySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const query = c.req.valid("query");
    const filters = [eq(channelDeadLetters.orgId, auth.orgId)];
    if (query.sourceType) filters.push(eq(channelDeadLetters.sourceType, query.sourceType));
    if (query.status === "open") filters.push(isNull(channelDeadLetters.resolvedAt));
    if (query.status === "resolved") filters.push(isNotNull(channelDeadLetters.resolvedAt));
    const rows = await c
      .get("store")
      .db.select()
      .from(channelDeadLetters)
      .where(and(...filters))
      .orderBy(desc(channelDeadLetters.createdAt))
      .limit(query.limit);
    return c.json({ items: rows.map((row) => serializeDeadLetter(row)) });
  });

  routes.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const [row] = await c
      .get("store")
      .db.select()
      .from(channelDeadLetters)
      .where(
        and(eq(channelDeadLetters.id, c.req.param("id")), eq(channelDeadLetters.orgId, auth.orgId)),
      )
      .limit(1);
    return row
      ? c.json({ deadLetter: serializeDeadLetter(row, true) })
      : c.json({ error: "not_found" }, 404);
  });

  routes.post(`${prefix}/:id/replay`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const target = await replayChannelDeadLetter(c.get("store"), {
      orgId: auth.orgId,
      deadLetterId: c.req.param("id"),
    });
    if (!target) return c.json({ error: "not_found" }, 404);
    await writeAudit(c, auth.sub, "channel.dead_letter.replayed", c.req.param("id"), {
      sourceType: target.sourceType,
      sourceId: target.sourceId,
    });
    try {
      if (target.sourceType === "ingress") {
        await getChannelDispatch().dispatchIngress(target.sourceId);
      } else if (target.sourceType === "session") {
        await getChannelDispatch().dispatchSession(target.conversationId);
      } else {
        await getChannelDispatch().dispatchDelivery(target.sourceId);
      }
    } catch (error) {
      c.get("log").error({ err: error, target }, "channel dead letter dispatch failed");
    }
    return c.json({ replayed: true, target });
  });

  routes.post(`${prefix}/:id/resolve`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const resolved = await resolveChannelDeadLetter(c.get("store"), {
      orgId: auth.orgId,
      deadLetterId: c.req.param("id"),
    });
    if (!resolved) return c.json({ error: "not_found" }, 404);
    await writeAudit(c, auth.sub, "channel.dead_letter.resolved", c.req.param("id"));
    return c.json({ resolved: true });
  });

  return routes;
}

function serializeDeadLetter(row: typeof channelDeadLetters.$inferSelect, includePayload = false) {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reasonCode: row.reasonCode,
    reason: row.reason,
    replayCount: row.replayCount,
    lastReplayedAt: row.lastReplayedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(includePayload ? { payload: row.payload } : {}),
  };
}

async function writeAudit(
  c: Context<{ Variables: AppVariables }>,
  actorId: string,
  action: string,
  resourceId: string,
  changes?: Record<string, unknown>,
) {
  const auth = c.get("auth");
  if (!auth) return;
  await c
    .get("store")
    .db.insert(auditLogs)
    .values({
      orgId: auth.orgId,
      actorType: "account",
      actorId,
      action,
      resourceType: "channel_dead_letter",
      resourceId,
      changes,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    });
}
