import { zValidator } from "@hono/zod-validator";
import { canAccess } from "@keenai/auth";
import { API_VERSION, APP_NAME } from "@keenai/shared";
import { accounts, members, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import { injectContext } from "./middleware/context.js";
import { attachLogger } from "./middleware/logger.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { openApiRoutes } from "./routes/openapi.js";
import type { AppContext, AppVariables } from "./types.js";

export function createApp(ctx: AppContext) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", cors());
  app.use("*", requestId());
  app.use("*", injectContext(ctx));
  app.use("*", attachLogger(ctx.log));
  app.use(
    `/api/${API_VERSION}/*`,
    rateLimit({ windowMs: ctx.env.RATE_LIMIT_WINDOW_MS, max: ctx.env.RATE_LIMIT_MAX }),
  );
  app.use(`/api/${API_VERSION}/*`, optionalAuth(ctx.authConfig));

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      app: APP_NAME,
      uptimeSec: Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000),
    }),
  );

  app.get(`/api/${API_VERSION}/health`, async (c) => {
    let db: "ok" | "error" = "ok";
    try {
      await ctx.store.ping();
    } catch {
      db = "error";
    }
    const status = db === "ok" ? "ok" : "degraded";
    return c.json(
      {
        status,
        app: APP_NAME,
        version: API_VERSION,
        db: { dialect: ctx.store.dialect, status: db },
        uptimeSec: Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000),
      },
      status === "ok" ? 200 : 503,
    );
  });

  app.route("/", authRoutes());
  app.route("/", openApiRoutes());
  app.route("/", conversationRoutes());

  app.get(`/api/${API_VERSION}/me`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const db = c.get("store").db;
    const [account] = await db.select().from(accounts).where(eq(accounts.id, auth.sub)).limit(1);
    const [member] = await db.select().from(members).where(eq(members.id, auth.memberId)).limit(1);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, auth.orgId))
      .limit(1);

    const canReadBilling = await canAccess(auth.role, "billing", "read");

    return c.json({
      account: account
        ? { id: account.id, email: account.email, name: account.name, avatarUrl: account.avatarUrl }
        : null,
      member: member
        ? { id: member.id, role: member.role, status: member.status, orgId: member.orgId }
        : null,
      organization: org ? { id: org.id, slug: org.slug, name: org.name, plan: org.plan } : null,
      brandIds: auth.brandIds,
      permissions: { billingRead: canReadBilling },
    });
  });

  const rbacProbeSchema = z.object({
    resource: z.string(),
    action: z.string(),
  });

  app.get(
    `/api/${API_VERSION}/rbac/check`,
    requireAuth(),
    zValidator("query", rbacProbeSchema),
    async (c) => {
      const auth = c.get("auth");
      const { resource, action } = c.req.valid("query");
      const allowed = await canAccess(auth?.role ?? "lite", resource, action);
      return c.json({ role: auth?.role, resource, action, allowed });
    },
  );

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    c.get("log").error({ err, requestId: c.get("requestId") }, "unhandled");
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
