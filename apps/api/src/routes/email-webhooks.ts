import {
  adaptMailgunInbound,
  adaptRawMimeBody,
  adaptSendGridInbound,
  adaptSesNotification,
} from "@keenai/channels-email";
import type { ParsedInboundEmailWithAttachments } from "@keenai/channels-email";
import { admitIngressEvent } from "@keenai/channels-runtime";
import { API_VERSION } from "@keenai/shared";
import { type Context, Hono } from "hono";
import { ensureChannelConnection, getChannelDispatch } from "../lib/channel-dispatch.js";
import { ingestInboundEmail, serializeInboundEmail } from "../lib/email-ingest.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import type { AppVariables } from "../types.js";

function verifyWebhookSecret(req: { header: (n: string) => string | undefined }) {
  const expected = process.env.WEBHOOK_EMAIL_SECRET;
  if (!expected) return true;
  const got = req.header("x-keenai-webhook-secret");
  return got === expected;
}

type EmailWebhookContext = Context<{ Variables: AppVariables }>;

async function acceptInboundEmail(
  c: EmailWebhookContext,
  input: {
    orgId: string;
    brandId: string;
    parsed: ParsedInboundEmailWithAttachments;
    provider: string;
  },
) {
  if (c.get("env").NODE_ENV === "test") {
    return ingestInboundEmail(c.get("store").db, {
      orgId: input.orgId,
      brandId: input.brandId,
      parsed: input.parsed,
      env: c.get("env"),
    });
  }
  const connection = await ensureChannelConnection(
    { store: c.get("store") },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      channelType: "email",
      externalAccountId: input.provider,
    },
  );
  const admission = await admitIngressEvent(c.get("store"), {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: connection.id,
    channelType: "email",
    providerEventId: input.parsed.messageId,
    eventType: "message",
    rawPayload: serializeInboundEmail(input.parsed),
    requestHeaders: c.req.header(),
  });
  if (!admission.duplicate) {
    try {
      await getChannelDispatch().dispatchIngress(admission.event.id);
    } catch (error) {
      c.get("log").error(
        { err: error, ingressEventId: admission.event.id },
        "email ingress dispatch failed; recovery will retry",
      );
    }
  }
  return {
    eventId: admission.event.id,
    duplicate: admission.duplicate,
    status: admission.event.status,
  };
}

export function emailWebhookRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/webhooks/email`;

  r.post(`${prefix}/inbound`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const raw = Buffer.from(await c.req.arrayBuffer());
    const parsed = await adaptRawMimeBody(raw);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      provider: "raw-mime",
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/ses`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await c.req.json();
    const parsed = await adaptSesNotification(body);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      provider: "ses",
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/sendgrid`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const form = await c.req.parseBody();
    const parsed = await adaptSendGridInbound(form as Record<string, string>);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      provider: "sendgrid",
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/mailgun`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const form = await c.req.parseBody();
    const parsed = await adaptMailgunInbound(form as Record<string, string>);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      provider: "mailgun",
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  return r;
}
