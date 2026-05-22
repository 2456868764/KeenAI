import { zValidator } from "@hono/zod-validator";
import {
  consumeMagicLink,
  createMagicLink,
  sendPortalMagicLinkEmail,
  signPortalAccessToken,
} from "@keenai/auth";
import {
  API_VERSION,
  listPortalTicketsSchema,
  portalMagicLinkRequestSchema,
  portalMagicLinkVerifySchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import { resolvePortalCustomerId } from "../lib/portal-access.js";
import {
  getTicketForOrg,
  listTicketsForCustomer,
  loadTicketMeta,
  serializePortalTicket,
} from "../lib/tickets.js";
import type { AppContext, AppVariables } from "../types.js";

export function portalRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/portal`;

  r.post(
    `${prefix}/:orgSlug/magic-link`,
    zValidator("json", portalMagicLinkRequestSchema),
    async (c) => {
      const orgSlug = c.req.param("orgSlug");
      const brandSlug = c.req.query("brand") ?? "default";
      const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
      if ("error" in resolved) return c.json({ error: resolved.error }, 404);

      const { email } = c.req.valid("json");
      const { token } = await createMagicLink(c.get("store").db, email);
      const result = await sendPortalMagicLinkEmail(c.get("authConfig"), email, token, orgSlug);

      if (!result.sent && result.devUrl) {
        c.get("log").info({ email, orgSlug, magicLink: result.devUrl }, "portal_magic_link_dev");
      }

      return c.json({ ok: true, sent: result.sent });
    },
  );

  r.post(
    `${prefix}/:orgSlug/magic-link/verify`,
    zValidator("json", portalMagicLinkVerifySchema),
    async (c) => {
      const orgSlug = c.req.param("orgSlug");
      const brandSlug = c.req.query("brand") ?? "default";
      const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
      if ("error" in resolved) return c.json({ error: resolved.error }, 404);

      const email = await consumeMagicLink(c.get("store").db, c.req.valid("json").token);
      if (!email) return c.json({ error: "invalid_or_expired_token" }, 401);

      const accessToken = await signPortalAccessToken(c.get("authConfig"), {
        sub: email.toLowerCase(),
        orgId: resolved.org.id,
        orgSlug,
        brandId: resolved.brand.id,
      });

      return c.json({
        accessToken,
        customerId: email.toLowerCase(),
        orgSlug,
        brandId: resolved.brand.id,
      });
    },
  );

  r.get(`${prefix}/:orgSlug/tickets`, zValidator("query", listPortalTicketsSchema), async (c) => {
    const { customerId: queryCustomerId } = c.req.valid("query");
    const customerId = resolvePortalCustomerId(c, ctx, queryCustomerId);
    if (!customerId) {
      return c.json(
        { error: ctx.env.PORTAL_PUBLIC_READ ? "missing_customer_id" : "unauthorized" },
        401,
      );
    }

    const brandSlug = c.req.query("brand") ?? "default";
    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      brandSlug,
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const portalAuth = c.get("portalAuth");
    if (portalAuth && portalAuth.orgId !== resolved.org.id) {
      return c.json({ error: "forbidden" }, 403);
    }

    const items = await listTicketsForCustomer(c.get("store").db, resolved.org.id, customerId);
    return c.json({ items: items.map(serializePortalTicket) });
  });

  r.get(`${prefix}/:orgSlug/tickets/:id`, async (c) => {
    const customerId = resolvePortalCustomerId(c, ctx, c.req.query("customerId") ?? undefined);
    if (!customerId) {
      return c.json(
        { error: ctx.env.PORTAL_PUBLIC_READ ? "missing_customer_id" : "unauthorized" },
        401,
      );
    }

    const brandSlug = c.req.query("brand") ?? "default";
    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      brandSlug,
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const row = await getTicketForOrg(c.get("store").db, c.req.param("id"), resolved.org.id);
    if (!row || row.customerId !== customerId) {
      return c.json({ error: "not_found" }, 404);
    }

    const ticket = await loadTicketMeta(c.get("store").db, row);
    return c.json({ ticket: serializePortalTicket(ticket) });
  });

  return r;
}
