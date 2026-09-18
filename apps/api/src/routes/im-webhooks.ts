import {
  type ImPlatform,
  type ParsedInboundImMessage,
  type WeComMessagePayload,
  adaptDingTalkRobot,
  adaptDiscordEvent,
  adaptFeishuEvent,
  adaptSlackEvent,
  adaptTelegramUpdate,
  adaptWeComMessage,
  adaptWhatsAppWebhook,
  decryptWeComPayload,
  feishuUrlVerificationChallenge,
  parseWeComMessageXml,
  parseWhatsAppDeliveryReceipts,
  readWeComXmlTag,
  slackUrlVerificationChallenge,
  verifyWeComSignature,
} from "@keenai/channels-im";
import { admitIngressEvent, recordDeliveryReceipt } from "@keenai/channels-runtime";
import { API_VERSION } from "@keenai/shared";
import { channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ensureChannelConnection, getChannelDispatch } from "../lib/channel-dispatch.js";
import { openChannelCredentials } from "../lib/channel-secrets.js";
import { ingestInboundIm } from "../lib/im-ingest.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import type { AppVariables } from "../types.js";

function verifyWebhookSecret(req: { header: (n: string) => string | undefined }) {
  const expected = process.env.WEBHOOK_IM_SECRET;
  if (!expected) return true;
  const got = req.header("x-keenai-webhook-secret");
  return got === expected;
}

type ImWebhookContext = Context<{ Variables: AppVariables }>;

async function acceptInboundMessage(
  c: ImWebhookContext,
  input: {
    orgId: string;
    brandId: string;
    platform: ImPlatform;
    parsed: ParsedInboundImMessage;
    rawPayload: unknown;
  },
) {
  // Keep existing synchronous response details in integration tests. Production
  // acknowledges only after the raw provider event is durably admitted.
  if (c.get("env").NODE_ENV === "test") {
    return ingestInboundIm(c.get("store").db, {
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
      channelType: input.platform,
      externalAccountId: externalAccountId(input.parsed),
    },
  );
  const admission = await admitIngressEvent(c.get("store"), {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: connection.id,
    channelType: input.platform,
    providerEventId: input.parsed.platformMessageId,
    eventType: "message",
    rawPayload: input.rawPayload,
    requestHeaders: c.req.header(),
  });

  if (!admission.duplicate) {
    try {
      await getChannelDispatch().dispatchIngress(admission.event.id);
    } catch (error) {
      // The recovery scanner owns persisted events when dispatch is unavailable.
      c.get("log").error(
        { err: error, ingressEventId: admission.event.id },
        "channel ingress dispatch failed; recovery will retry",
      );
    }
  }
  return {
    eventId: admission.event.id,
    duplicate: admission.duplicate,
    status: admission.event.status,
  };
}

function externalAccountId(parsed: ParsedInboundImMessage): string {
  const attributes = parsed.conversationAttributes;
  for (const key of ["teamId", "guildId", "phoneNumberId", "appId", "agentId"]) {
    const value = attributes?.[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "default";
}

async function loadWeComCryptoConfig(
  c: ImWebhookContext,
  input: { orgId: string; brandId: string },
) {
  const [connection] = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, input.orgId),
        eq(channelConnections.brandId, input.brandId),
        eq(channelConnections.channelType, "wecom"),
        eq(channelConnections.status, "active"),
      ),
    )
    .limit(1);
  if (!connection) return null;
  const credentials = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const token = credentials.callbackToken;
  const encodingAesKey = credentials.encodingAesKey;
  const corpId = credentials.corpId;
  return typeof token === "string" &&
    typeof encodingAesKey === "string" &&
    typeof corpId === "string"
    ? { token, encodingAesKey, corpId }
    : null;
}

async function readVerifiedChannelJson<T>(
  c: ImWebhookContext,
  input: { orgId: string; brandId: string; channelType: ImPlatform },
): Promise<T> {
  const rawBody = await c.req.text();
  const [connection] = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, input.orgId),
        eq(channelConnections.brandId, input.brandId),
        eq(channelConnections.channelType, input.channelType),
        eq(channelConnections.status, "active"),
      ),
    )
    .limit(1);
  const credentials = connection
    ? openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret)
    : {};
  if (!verifyConfiguredChannelSignature(c, input.channelType, rawBody, credentials)) {
    throw new HTTPException(403, { message: "invalid_provider_signature" });
  }
  let body: T;
  try {
    body = JSON.parse(rawBody) as T;
  } catch {
    throw new HTTPException(400, { message: "invalid_json" });
  }
  if (input.channelType === "feishu" && !verifyFeishuToken(body, credentials.verificationToken)) {
    throw new HTTPException(403, { message: "invalid_provider_signature" });
  }
  return body;
}

function verifyConfiguredChannelSignature(
  c: ImWebhookContext,
  channelType: ImPlatform,
  rawBody: string,
  credentials: Record<string, unknown>,
): boolean {
  if (channelType === "telegram" && typeof credentials.webhookSecret === "string") {
    return safeEqual(
      c.req.header("x-telegram-bot-api-secret-token") ?? "",
      credentials.webhookSecret,
    );
  }
  if (channelType === "slack" && typeof credentials.signingSecret === "string") {
    const timestamp = c.req.header("x-slack-request-timestamp") ?? "";
    const signature = c.req.header("x-slack-signature") ?? "";
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1_000 - timestampSeconds) > 300
    ) {
      return false;
    }
    const expected = `v0=${createHmac("sha256", credentials.signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;
    return safeEqual(signature, expected);
  }
  if (channelType === "whatsapp" && typeof credentials.appSecret === "string") {
    const expected = `sha256=${createHmac("sha256", credentials.appSecret)
      .update(rawBody)
      .digest("hex")}`;
    return safeEqual(c.req.header("x-hub-signature-256") ?? "", expected);
  }
  if (channelType === "discord" && typeof credentials.publicKey === "string") {
    const timestamp = c.req.header("x-signature-timestamp") ?? "";
    const signature = c.req.header("x-signature-ed25519") ?? "";
    try {
      const publicKey = createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          Buffer.from(credentials.publicKey, "hex"),
        ]),
        format: "der",
        type: "spki",
      });
      return verifySignature(
        null,
        Buffer.from(`${timestamp}${rawBody}`),
        publicKey,
        Buffer.from(signature, "hex"),
      );
    } catch {
      return false;
    }
  }
  if (channelType === "dingtalk" && typeof credentials.signingSecret === "string") {
    const timestamp = c.req.query("timestamp") ?? "";
    const signature = c.req.query("sign") ?? "";
    const expected = createHmac("sha256", credentials.signingSecret)
      .update(`${timestamp}\n${credentials.signingSecret}`)
      .digest("base64");
    return safeEqual(signature, expected);
  }
  return true;
}

function verifyFeishuToken(body: unknown, configuredToken: unknown): boolean {
  if (typeof configuredToken !== "string") return true;
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  const header = record.header;
  const token =
    record.token ??
    (header && typeof header === "object" ? (header as Record<string, unknown>).token : undefined);
  return typeof token === "string" && safeEqual(token, configuredToken);
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
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

    const body = await readVerifiedChannelJson<Parameters<typeof adaptTelegramUpdate>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "telegram",
    });
    const parsed = adaptTelegramUpdate(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "telegram",
      parsed,
      rawPayload: body,
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

    const body = await readVerifiedChannelJson<Parameters<typeof adaptDiscordEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "discord",
    });
    const parsed = adaptDiscordEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "discord",
      parsed,
      rawPayload: body,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/slack`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await readVerifiedChannelJson<Parameters<typeof adaptSlackEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "slack",
    });
    const challenge = slackUrlVerificationChallenge(body);
    if (challenge) return c.json({ challenge });

    const parsed = adaptSlackEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "slack",
      parsed,
      rawPayload: body,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/feishu`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await readVerifiedChannelJson<Parameters<typeof adaptFeishuEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "feishu",
    });
    const challenge = feishuUrlVerificationChallenge(body);
    if (challenge) return c.json({ challenge });

    const parsed = adaptFeishuEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "feishu",
      parsed,
      rawPayload: body,
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

    const body = await readVerifiedChannelJson<Parameters<typeof adaptDingTalkRobot>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "dingtalk",
    });
    const parsed = adaptDingTalkRobot(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "dingtalk",
      parsed,
      rawPayload: body,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.get(`${prefix}/whatsapp`, async (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    let expected = c.get("env").WHATSAPP_VERIFY_TOKEN;
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (orgSlug) {
      const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
      if (!("error" in resolved)) {
        const [connection] = await c
          .get("store")
          .db.select()
          .from(channelConnections)
          .where(
            and(
              eq(channelConnections.orgId, resolved.org.id),
              eq(channelConnections.brandId, resolved.brand.id),
              eq(channelConnections.channelType, "whatsapp"),
              eq(channelConnections.status, "active"),
            ),
          )
          .limit(1);
        if (connection) {
          const credentials = openChannelCredentials(
            connection.credentials,
            c.get("authConfig").jwtSecret,
          );
          if (typeof credentials.verifyToken === "string") expected = credentials.verifyToken;
        }
      }
    }

    const tokenMatches = expected ? token === expected : c.get("env").NODE_ENV !== "production";
    if (mode === "subscribe" && challenge && tokenMatches) {
      return c.text(challenge);
    }
    return c.json({ error: "forbidden" }, 403);
  });

  r.post(`${prefix}/whatsapp`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const body = await readVerifiedChannelJson<Parameters<typeof adaptWhatsAppWebhook>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "whatsapp",
    });
    const receipts = parseWhatsAppDeliveryReceipts(body);
    if (receipts.length > 0) {
      const [connection] = await c
        .get("store")
        .db.select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.orgId, resolved.org.id),
            eq(channelConnections.brandId, resolved.brand.id),
            eq(channelConnections.channelType, "whatsapp"),
            eq(channelConnections.status, "active"),
          ),
        )
        .limit(1);
      if (!connection) return c.json({ error: "whatsapp_not_configured" }, 503);
      for (const receipt of receipts) {
        await recordDeliveryReceipt(c.get("store"), {
          orgId: resolved.org.id,
          connectionId: connection.id,
          receipt,
        });
      }
      return c.json({ accepted: true, receipts: receipts.length }, 202);
    }
    const parsed = adaptWhatsAppWebhook(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "whatsapp",
      parsed,
      rawPayload: body,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.get(`${prefix}/wecom`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);
    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);
    const config = await loadWeComCryptoConfig(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    if (!config) return c.json({ error: "wecom_not_configured" }, 503);
    const signature = c.req.query("msg_signature");
    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    const echo = c.req.query("echostr");
    if (!signature || !timestamp || !nonce || !echo) {
      return c.json({ error: "invalid_wecom_verification" }, 400);
    }
    if (
      !verifyWeComSignature({
        token: config.token,
        timestamp,
        nonce,
        encrypted: echo,
        signature,
      })
    ) {
      return c.json({ error: "invalid_wecom_signature" }, 403);
    }
    return c.text(decryptWeComPayload(echo, config));
  });

  r.post(`${prefix}/wecom`, async (c) => {
    if (!verifyWebhookSecret(c.req)) return c.json({ error: "forbidden" }, 403);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const contentType = c.req.header("content-type") ?? "";
    let body: WeComMessagePayload;
    let officialCallback = false;
    if (contentType.includes("xml") || contentType.includes("text/plain")) {
      officialCallback = true;
      const config = await loadWeComCryptoConfig(c, {
        orgId: resolved.org.id,
        brandId: resolved.brand.id,
      });
      if (!config) return c.json({ error: "wecom_not_configured" }, 503);
      const xml = await c.req.text();
      const encrypted = readWeComXmlTag(xml, "Encrypt");
      const signature = c.req.query("msg_signature");
      const timestamp = c.req.query("timestamp");
      const nonce = c.req.query("nonce");
      if (!encrypted || !signature || !timestamp || !nonce) {
        return c.json({ error: "invalid_wecom_callback" }, 400);
      }
      if (
        !verifyWeComSignature({
          token: config.token,
          timestamp,
          nonce,
          encrypted,
          signature,
        })
      ) {
        return c.json({ error: "invalid_wecom_signature" }, 403);
      }
      body = parseWeComMessageXml(decryptWeComPayload(encrypted, config));
    } else {
      body = await c.req.json<WeComMessagePayload>();
    }
    const parsed = adaptWeComMessage(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "wecom",
      parsed,
      rawPayload: body,
    });
    return officialCallback ? c.text("success", 202) : c.json({ accepted: true, ...result }, 202);
  });

  return r;
}
import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
