import { zValidator } from "@hono/zod-validator";
import { API_VERSION, listPortalTicketsSchema } from "@keenai/shared";
import { Hono } from "hono";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
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

  r.get(`${prefix}/:orgSlug/tickets`, zValidator("query", listPortalTicketsSchema), async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "portal_disabled" }, 403);
    }

    const { customerId } = c.req.valid("query");
    const brandSlug = c.req.query("brand") ?? "default";
    const resolved = await resolveOrgBrandBySlug(
      c.get("store").db,
      c.req.param("orgSlug"),
      brandSlug,
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const items = await listTicketsForCustomer(c.get("store").db, resolved.org.id, customerId);
    return c.json({ items: items.map(serializePortalTicket) });
  });

  r.get(`${prefix}/:orgSlug/tickets/:id`, async (c) => {
    if (!ctx.env.PORTAL_PUBLIC_READ) {
      return c.json({ error: "portal_disabled" }, 403);
    }

    const brandSlug = c.req.query("brand") ?? "default";
    const customerId = c.req.query("customerId");
    if (!customerId) return c.json({ error: "missing_customer_id" }, 400);

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
