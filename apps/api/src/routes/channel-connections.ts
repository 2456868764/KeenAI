import { zValidator } from "@hono/zod-validator";
import { CHANNEL_TYPES, type ChannelType } from "@keenai/channels-core";
import { DASHBOARD_API_PREFIX } from "@keenai/shared";
import { auditLogs, channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
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
  transport: z.enum(["webhook", "gateway", "polling", "stream"]).default("webhook"),
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
              transport: body.transport,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastError: null,
              runtimeNextAttemptAt: null,
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
              transport: body.transport,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastConnectedAt: now,
            })
            .returning();
      if (!row) return c.json({ error: "save_failed" }, 500);
      await writeConnectionAudit(c, auth.sub, {
        action: existing ? "channel.connection.updated" : "channel.connection.created",
        connectionId: row.id,
        changes: {
          brandId: body.brandId,
          channelType,
          externalAccountId: body.externalAccountId,
          status: body.status,
          transport: body.transport,
          configuredCredentialKeys: Object.entries(body.credentials ?? {})
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key]) => key)
            .sort(),
          settingsKeys: Object.keys(body.settings).sort(),
        },
      });
      return c.json({ connection: serializeConnection(row, secret) });
    },
  );

  r.delete(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const rows = await c
      .get("store")
      .db.update(channelConnections)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(
        and(eq(channelConnections.id, c.req.param("id")), eq(channelConnections.orgId, auth.orgId)),
      )
      .returning({ id: channelConnections.id, channelType: channelConnections.channelType });
    const connection = rows[0];
    if (!connection) return c.json({ error: "not_found" }, 404);
    await writeConnectionAudit(c, auth.sub, {
      action: "channel.connection.disabled",
      connectionId: connection.id,
      changes: { channelType: connection.channelType, status: "disabled" },
    });
    return c.body(null, 204);
  });

  return r;
}

async function writeConnectionAudit(
  c: Context<{ Variables: AppVariables }>,
  actorId: string,
  input: {
    action: string;
    connectionId: string;
    changes?: Record<string, unknown>;
  },
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
      action: input.action,
      resourceType: "channel_connection",
      resourceId: input.connectionId,
      changes: input.changes,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    });
}

function serializeConnection(row: typeof channelConnections.$inferSelect, secret: string) {
  return {
    id: row.id,
    brandId: row.brandId,
    channelType: row.channelType as ChannelType,
    name: row.name,
    externalAccountId: row.externalAccountId,
    status: row.status,
    transport: row.transport,
    configuredCredentialKeys: channelCredentialKeys(row.credentials, secret),
    settings: row.settings,
    lastError: row.lastError,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    runtimeState: row.runtimeState,
    runtimeHeartbeatAt: row.runtimeHeartbeatAt?.toISOString() ?? null,
    runtimeNextAttemptAt: row.runtimeNextAttemptAt?.toISOString() ?? null,
    reconnectAttempts: row.reconnectAttempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
