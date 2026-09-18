import { zValidator } from "@hono/zod-validator";
import { CHANNEL_TYPES, type ChannelType } from "@keenai/channels-core";
import { DASHBOARD_API_PREFIX } from "@keenai/shared";
import { channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  channelCredentialKeys,
  openChannelCredentials,
  sealChannelCredentials,
} from "../lib/channel-secrets.js";
import { canAccessBrand } from "../lib/conversations.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

const channelTypeSchema = z.enum(CHANNEL_TYPES);
const upsertConnectionSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  externalAccountId: z.string().trim().min(1).max(255).default("default"),
  status: z.enum(["active", "disabled", "error"]).default("active"),
  credentials: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export function channelConnectionRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/channel-connections`;

  r.get(prefix, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const brandId = c.req.query("brandId");
    if (brandId && !canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
    const filters = [eq(channelConnections.orgId, auth.orgId)];
    if (brandId) filters.push(eq(channelConnections.brandId, brandId));
    const rows = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(and(...filters));
    return c.json({
      items: rows.map((row) => serializeConnection(row, c.get("authConfig").jwtSecret)),
    });
  });

  r.put(
    `${prefix}/:channelType`,
    requireAuth(),
    zValidator("param", z.object({ channelType: channelTypeSchema })),
    zValidator("json", upsertConnectionSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) return c.json({ error: "forbidden" }, 403);
      const channelType = c.req.valid("param").channelType;
      const secret = c.get("authConfig").jwtSecret;
      const [existing] = await c
        .get("store")
        .db.select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.orgId, auth.orgId),
            eq(channelConnections.brandId, body.brandId),
            eq(channelConnections.channelType, channelType),
            eq(channelConnections.externalAccountId, body.externalAccountId),
          ),
        )
        .limit(1);
      const credentials = body.credentials
        ? {
            ...(existing ? openChannelCredentials(existing.credentials, secret) : {}),
            ...body.credentials,
          }
        : existing
          ? openChannelCredentials(existing.credentials, secret)
          : {};
      const now = new Date();
      const [row] = existing
        ? await c
            .get("store")
            .db.update(channelConnections)
            .set({
              name: body.name,
              status: body.status,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(channelConnections.id, existing.id))
            .returning()
        : await c
            .get("store")
            .db.insert(channelConnections)
            .values({
              orgId: auth.orgId,
              brandId: body.brandId,
              channelType,
              name: body.name,
              externalAccountId: body.externalAccountId,
              status: body.status,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastConnectedAt: now,
            })
            .returning();
      if (!row) return c.json({ error: "save_failed" }, 500);
      return c.json({ connection: serializeConnection(row, secret) });
    },
  );

  r.delete(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const rows = await c
      .get("store")
      .db.delete(channelConnections)
      .where(
        and(eq(channelConnections.id, c.req.param("id")), eq(channelConnections.orgId, auth.orgId)),
      )
      .returning({ id: channelConnections.id });
    return rows.length === 0 ? c.json({ error: "not_found" }, 404) : c.body(null, 204);
  });

  return r;
}

function serializeConnection(row: typeof channelConnections.$inferSelect, secret: string) {
  return {
    id: row.id,
    brandId: row.brandId,
    channelType: row.channelType as ChannelType,
    name: row.name,
    externalAccountId: row.externalAccountId,
    status: row.status,
    configuredCredentialKeys: channelCredentialKeys(row.credentials, secret),
    settings: row.settings,
    lastError: row.lastError,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
