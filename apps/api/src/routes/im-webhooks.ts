import {
  adaptDingTalkRobot,
  adaptDiscordEvent,
  adaptFeishuEvent,
  adaptSlackEvent,
  adaptTelegramUpdate,
  feishuUrlVerificationChallenge,
  slackUrlVerificationChallenge,
} from "@keenai/channels-im";
import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { ingestInboundIm } from "../lib/im-ingest.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import type { AppVariables } from "../types.js";

function verifyWebhookSecret(req: { header: (n: string) => string | undefined }) {
  const expected = process.env.WEBHOOK_IM_SECRET;
  if (!expected) return true;
  const got = req.header("x-keenai-webhook-secret");
  return got === expected;
}

export function imWebhookRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/webhooks/im`;

  r.post(`${prefix}/telegram`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await c.req.json();
    const parsed = adaptTelegramUpdate(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await ingestInboundIm(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      env: c.get("env"),
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/discord`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await c.req.json();
    const parsed = adaptDiscordEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await ingestInboundIm(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      env: c.get("env"),
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/slack`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const body = await c.req.json();
    const challenge = slackUrlVerificationChallenge(body);
    if (challenge) return c.json({ challenge });

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const parsed = adaptSlackEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await ingestInboundIm(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      env: c.get("env"),
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/feishu`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const body = await c.req.json();
    const challenge = feishuUrlVerificationChallenge(body);
    if (challenge) return c.json({ challenge });

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const parsed = adaptFeishuEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await ingestInboundIm(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      env: c.get("env"),
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/dingtalk`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await c.req.json();
    const parsed = adaptDingTalkRobot(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await ingestInboundIm(c.get("store").db, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      env: c.get("env"),
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  return r;
}
