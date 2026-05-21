import {
  adaptMailgunInbound,
  adaptRawMimeBody,
  adaptSendGridInbound,
  adaptSesNotification,
} from "@keenai/channels-email";
import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { ingestInboundEmail } from "../lib/email-ingest.js";
import { resolveBrandBySlug, resolveOrgBySlug } from "../lib/widget.js";
import type { AppVariables } from "../types.js";

function verifyWebhookSecret(req: { header: (n: string) => string | undefined }) {
  const expected = process.env.WEBHOOK_EMAIL_SECRET;
  if (!expected) return true;
  const got = req.header("x-keenai-webhook-secret");
  return got === expected;
}

async function resolveOrgBrand(
  db: AppVariables["store"]["db"],
  orgSlug: string,
  brandSlug: string,
) {
  const org = await resolveOrgBySlug(db, orgSlug);
  if (!org) return { error: "org_not_found" as const };
  const brand = await resolveBrandBySlug(db, org.id, brandSlug);
  if (!brand) return { error: "brand_not_found" as const };
  return { org, brand };
}

export function emailWebhookRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/webhooks/email`;

  r.post(`${prefix}/inbound`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrand(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const raw = Buffer.from(await c.req.arrayBuffer());
    const parsed = await adaptRawMimeBody(raw);
    const result = await ingestInboundEmail(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/ses`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrand(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await c.req.json();
    const parsed = await adaptSesNotification(body);
    const result = await ingestInboundEmail(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/sendgrid`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrand(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const form = await c.req.parseBody();
    const parsed = await adaptSendGridInbound(form as Record<string, string>);
    const result = await ingestInboundEmail(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/mailgun`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrand(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const form = await c.req.parseBody();
    const parsed = await adaptMailgunInbound(form as Record<string, string>);
    const result = await ingestInboundEmail(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  return r;
}
