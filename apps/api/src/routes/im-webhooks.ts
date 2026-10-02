import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import {
  type ImPlatform,
  type ParsedInboundImMessage,
  type WeComMessagePayload,
  adaptDingTalkRobot,
  adaptDiscordEvent,
  adaptFeishuEvent,
  adaptSlackEvent,
  adaptTelegramUpdate,
  adaptWeChatMessage,
  adaptWeComMessage,
  adaptWhatsAppWebhook,
  decryptDingTalkPayload,
  decryptWeChatPayload,
  decryptWeComPayload,
  encryptDingTalkResponse,
  feishuUrlVerificationChallenge,
  parseWeChatMessageXml,
  parseWeComMessageXml,
  readWeChatXmlTag,
  readWeComXmlTag,
  slackUrlVerificationChallenge,
  splitTelegramUpdate,
  verifyDingTalkSignature,
  verifyWeChatMessageSignature,
  verifyWeChatSignature,
  verifyWeComSignature,
} from "@keenai/channels-im";
import { admitIngressEvent, recordDeliveryReceipt } from "@keenai/channels-runtime";
import { API_VERSION } from "@keenai/shared";
import { auditLogs, channelConnections, workflowRuns } from "@keenai/storage/schema";
import { and, eq, ne } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { verifyChannelWorkflowButton } from "../lib/channel-action-token.js";
import { ensureChannelConnection, getChannelDispatch } from "../lib/channel-dispatch.js";
import { getChannelPluginRegistry } from "../lib/channel-plugins.js";
import { putChannelProviderAppState } from "../lib/channel-provider-app-state.js";
import { openChannelCredentials } from "../lib/channel-secrets.js";
import { parseFeishuMarketplaceWebhook } from "../lib/feishu-marketplace.js";
import { ingestInboundIm } from "../lib/im-ingest.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import { answerTelegramCallbackQuery } from "../lib/telegram-polling.js";
import { resumeReplyButtonsWorkflow } from "../lib/workflow-resume.js";
import type { AppVariables } from "../types.js";

type ImWebhookContext = Context<{ Variables: AppVariables }>;

async function acceptInboundMessage(
  c: ImWebhookContext,
  input: {
    orgId: string;
    brandId: string;
    platform: ImPlatform;
    parsed: ParsedInboundImMessage;
    rawPayload: unknown;
    connection?: typeof channelConnections.$inferSelect | null;
    deferDispatch?: boolean;
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
      channelCredentials: input.connection
        ? openChannelCredentials(input.connection.credentials, c.get("authConfig").jwtSecret)
        : undefined,
    });
  }

  const connection =
    input.connection ??
    (c.get("env").NODE_ENV === "production"
      ? null
      : await ensureChannelConnection(
          { store: c.get("store") },
          {
            orgId: input.orgId,
            brandId: input.brandId,
            channelType: input.platform,
            externalAccountId: externalAccountId(input.parsed),
          },
        ));
  if (!connection) throw new HTTPException(503, { message: "channel_not_configured" });
  const providerEventId = await resolveProviderEventId(c, {
    platform: input.platform,
    rawPayload: input.rawPayload,
    connection,
    fallback: input.parsed.platformMessageId,
  });
  const admission = await admitIngressEvent(c.get("store"), {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: connection.id,
    channelType: input.platform,
    providerEventId,
    eventType: input.parsed.mutation?.type ?? "message",
    rawPayload: input.rawPayload,
    requestHeaders: c.req.header(),
  });

  if (!admission.duplicate && !input.deferDispatch) {
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
  for (const key of [
    "teamId",
    "guildId",
    "phoneNumberId",
    "whatsappPhoneNumberId",
    "appId",
    "agentId",
    "wecomAgentId",
    "wechatAppId",
  ]) {
    const value = attributes?.[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "default";
}

async function loadWeChatCryptoConfig(
  c: ImWebhookContext,
  input: { orgId: string; brandId: string },
) {
  const connection = await loadWebhookConnection(c, {
    ...input,
    channelType: "wechat",
  });
  if (!connection) return null;
  const credentials = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const token = credentials.callbackToken;
  const appId = credentials.appId;
  const encodingAesKey = credentials.encodingAesKey;
  return typeof token === "string" && typeof appId === "string"
    ? {
        token,
        appId,
        encodingAesKey: typeof encodingAesKey === "string" ? encodingAesKey : undefined,
        connection,
      }
    : null;
}

async function loadWeComCryptoConfig(
  c: ImWebhookContext,
  input: { orgId: string; brandId: string },
) {
  const connection = await loadWebhookConnection(c, {
    ...input,
    channelType: "wecom",
  });
  if (!connection) return null;
  const credentials = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const token = credentials.callbackToken;
  const encodingAesKey = credentials.encodingAesKey;
  const corpId = credentials.corpId;
  return typeof token === "string" &&
    typeof encodingAesKey === "string" &&
    typeof corpId === "string"
    ? { token, encodingAesKey, corpId, connection }
    : null;
}

async function readVerifiedChannelJson<T>(
  c: ImWebhookContext,
  input: { orgId: string; brandId: string; channelType: ImPlatform },
): Promise<{
  body: T;
  connection: typeof channelConnections.$inferSelect | null;
}> {
  const rawBody = await c.req.text();
  let body: T;
  try {
    if (
      input.channelType === "slack" &&
      (c.req.header("content-type") ?? "").includes("application/x-www-form-urlencoded")
    ) {
      const encoded = new URLSearchParams(rawBody).get("payload");
      if (!encoded) throw new Error("slack_payload_missing");
      body = JSON.parse(encoded) as T;
    } else {
      body = JSON.parse(rawBody) as T;
    }
  } catch {
    throw new HTTPException(400, { message: "invalid_json" });
  }
  const externalAccountId =
    input.channelType === "slack"
      ? slackTeamId(body)
      : input.channelType === "discord"
        ? discordGuildId(body)
        : input.channelType === "whatsapp"
          ? whatsappPhoneNumberId(body)
          : undefined;
  const connection = await loadWebhookConnection(c, {
    ...input,
    externalAccountId,
  });
  if (
    externalAccountId &&
    connection &&
    connection.externalAccountId !== externalAccountId &&
    connection.externalAccountId !== "default"
  ) {
    throw new HTTPException(403, { message: "channel_account_mismatch" });
  }
  const credentials = connection
    ? openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret)
    : {};
  if (
    input.channelType === "whatsapp" &&
    externalAccountId &&
    connection &&
    credentials.phoneNumberId !== externalAccountId
  ) {
    throw new HTTPException(403, { message: "channel_account_mismatch" });
  }
  if (!verifyConfiguredChannelSignature(c, input.channelType, rawBody, credentials)) {
    throw new HTTPException(403, { message: "invalid_provider_signature" });
  }
  if (
    input.channelType === "feishu" &&
    c.get("env").NODE_ENV === "production" &&
    typeof credentials.verificationToken !== "string"
  ) {
    throw new HTTPException(403, { message: "invalid_provider_signature" });
  }
  if (input.channelType === "feishu") {
    const appId = stringCredential(credentials.appId);
    const encryptKey = stringCredential(credentials.encryptKey);
    const verificationToken = stringCredential(credentials.verificationToken);
    if (appId) {
      try {
        body = parseFeishuMarketplaceWebhook({
          rawBody,
          headers: c.req.header(),
          appId,
          verificationToken,
          encryptKey,
        }).payload as T;
      } catch {
        throw new HTTPException(403, { message: "invalid_provider_signature" });
      }
    } else if (!verifyFeishuToken(body, verificationToken)) {
      throw new HTTPException(403, { message: "invalid_provider_signature" });
    }
  }
  return { body, connection };
}

async function loadWebhookConnection(
  c: ImWebhookContext,
  input: {
    orgId: string;
    brandId: string;
    channelType: ImPlatform;
    externalAccountId?: string;
  },
) {
  const connectionId = c.req.query("connection");
  const filters = [
    eq(channelConnections.orgId, input.orgId),
    eq(channelConnections.brandId, input.brandId),
    eq(channelConnections.channelType, input.channelType),
    eq(channelConnections.status, "active"),
  ];
  if (connectionId) filters.push(eq(channelConnections.id, connectionId));
  else if (input.externalAccountId) {
    filters.push(eq(channelConnections.externalAccountId, input.externalAccountId));
  }
  const rows = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(and(...filters))
    .limit(connectionId ? 1 : 2);
  if (rows.length > 1) {
    throw new HTTPException(409, { message: "ambiguous_channel_connection" });
  }
  let connection = rows[0] ?? null;
  if (!connection && !connectionId && input.channelType === "whatsapp" && input.externalAccountId) {
    const [fallback] = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.orgId, input.orgId),
          eq(channelConnections.brandId, input.brandId),
          eq(channelConnections.channelType, "whatsapp"),
          eq(channelConnections.externalAccountId, "default"),
          eq(channelConnections.status, "active"),
        ),
      )
      .limit(1);
    if (fallback) {
      const credentials = openChannelCredentials(
        fallback.credentials,
        c.get("authConfig").jwtSecret,
      );
      if (credentials.phoneNumberId === input.externalAccountId) connection = fallback;
    }
  }
  if (!connection && c.get("env").NODE_ENV === "production") {
    throw new HTTPException(503, { message: "channel_not_configured" });
  }
  return connection;
}

async function loadCentralWebhookConnection(
  c: ImWebhookContext,
  input: { channelType: ImPlatform; externalAccountId: string },
) {
  const filters = [
    eq(channelConnections.channelType, input.channelType),
    eq(channelConnections.status, "active"),
  ];
  const connectionId = c.req.query("connection");
  if (connectionId) filters.push(eq(channelConnections.id, connectionId));
  else filters.push(eq(channelConnections.externalAccountId, input.externalAccountId));
  const rows = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(and(...filters))
    .limit(2);
  if (rows.length > 1) {
    throw new HTTPException(409, { message: "ambiguous_channel_connection" });
  }
  const connection = rows[0];
  if (!connection) throw new HTTPException(503, { message: "channel_not_configured" });
  if (
    connection.externalAccountId !== input.externalAccountId &&
    connection.externalAccountId !== "default"
  ) {
    throw new HTTPException(403, { message: "channel_account_mismatch" });
  }
  return connection;
}

function parseProviderJson<T>(
  rawBody: string,
  channelType: "slack" | "discord",
  contentType: string | undefined,
): T {
  try {
    if (channelType === "slack" && contentType?.includes("application/x-www-form-urlencoded")) {
      const encoded = new URLSearchParams(rawBody).get("payload");
      if (!encoded) throw new Error("slack_payload_missing");
      return JSON.parse(encoded) as T;
    }
    return JSON.parse(rawBody) as T;
  } catch {
    throw new HTTPException(400, { message: "invalid_json" });
  }
}

function slackTeamId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  const direct = body.team_id;
  if (typeof direct === "string" && direct) return direct;
  if (body.team && typeof body.team === "object") {
    const teamId = (body.team as Record<string, unknown>).id;
    if (typeof teamId === "string" && teamId) return teamId;
  }
  const authorizations = body.authorizations;
  if (Array.isArray(authorizations)) {
    const first = authorizations[0];
    if (first && typeof first === "object") {
      const teamId = (first as Record<string, unknown>).team_id;
      if (typeof teamId === "string" && teamId) return teamId;
    }
  }
  return undefined;
}

function discordGuildId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  const direct = body.guild_id;
  if (typeof direct === "string" && direct) return direct;
  const data = body.d;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).guild_id;
    if (typeof nested === "string" && nested) return nested;
  }
  return undefined;
}

function discordInteractionType(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const type = (payload as Record<string, unknown>).type;
  return typeof type === "number" ? type : undefined;
}

function whatsappPhoneNumberId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return undefined;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value =
        change && typeof change === "object" ? (change as { value?: unknown }).value : null;
      const metadata =
        value && typeof value === "object" ? (value as { metadata?: unknown }).metadata : null;
      const phoneId =
        metadata && typeof metadata === "object"
          ? (metadata as { phone_number_id?: unknown }).phone_number_id
          : null;
      if (typeof phoneId === "string" && phoneId) ids.add(phoneId);
    }
  }
  if (ids.size > 1)
    throw new HTTPException(409, {
      message: "ambiguous_whatsapp_phone_numbers",
    });
  return ids.values().next().value;
}

type WhatsAppWebhookPayload = Parameters<typeof adaptWhatsAppWebhook>[0];

function splitWhatsAppWebhookPayload(
  payload: WhatsAppWebhookPayload,
): Array<{ phoneNumberId: string; payload: WhatsAppWebhookPayload }> {
  const result: Array<{
    phoneNumberId: string;
    payload: WhatsAppWebhookPayload;
  }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      result.push({
        phoneNumberId,
        payload: {
          object: payload.object,
          entry: [{ id: entry.id, changes: [change] }],
        },
      });
    }
  }
  return result;
}

async function loadCentralWhatsAppConnection(
  c: ImWebhookContext,
  input: { phoneNumberId: string; orgId?: string; brandId?: string },
) {
  const filters = [
    eq(channelConnections.channelType, "whatsapp"),
    eq(channelConnections.status, "active"),
  ];
  if (input.orgId) filters.push(eq(channelConnections.orgId, input.orgId));
  if (input.brandId) filters.push(eq(channelConnections.brandId, input.brandId));
  const connectionId = c.req.query("connection");
  if (connectionId) {
    const [connection] = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(and(...filters, eq(channelConnections.id, connectionId)))
      .limit(1);
    if (!connection) throw new HTTPException(503, { message: "channel_not_configured" });
    return connection;
  }
  const exact = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(and(...filters, eq(channelConnections.externalAccountId, input.phoneNumberId)))
    .limit(2);
  if (exact.length > 1) {
    throw new HTTPException(409, { message: "ambiguous_channel_connection" });
  }
  if (exact[0]) return exact[0];

  const legacy = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(and(...filters, eq(channelConnections.externalAccountId, "default")));
  const matching = legacy.filter((connection) => {
    const credentials = openChannelCredentials(
      connection.credentials,
      c.get("authConfig").jwtSecret,
    );
    return credentials.phoneNumberId === input.phoneNumberId;
  });
  if (matching.length > 1) {
    throw new HTTPException(409, { message: "ambiguous_channel_connection" });
  }
  const connection = matching[0];
  if (!connection) throw new HTTPException(503, { message: "channel_not_configured" });
  return connection;
}

async function resolveProviderEventId(
  c: ImWebhookContext,
  input: {
    platform: ImPlatform;
    rawPayload: unknown;
    connection: typeof channelConnections.$inferSelect;
    fallback: string;
  },
) {
  const plugin = getChannelPluginRegistry().get(input.platform);
  if (!plugin.parseWebhook) return input.fallback;
  const rawBody = new TextEncoder().encode(JSON.stringify(input.rawPayload));
  const events = await plugin.parseWebhook(
    {
      headers: c.req.header(),
      query: Object.fromEntries(new URL(c.req.url).searchParams),
      rawBody,
      receivedAt: new Date(),
    },
    {
      connectionId: input.connection.id,
      orgId: input.connection.orgId,
      brandId: input.connection.brandId,
      channelType: input.connection.channelType,
      credentials: openChannelCredentials(
        input.connection.credentials,
        c.get("authConfig").jwtSecret,
      ),
      settings: input.connection.settings,
    },
  );
  return events[0]?.providerEventId ?? input.fallback;
}

async function acceptDeliveryReceipts(
  c: ImWebhookContext,
  input: {
    orgId: string;
    platform: ImPlatform;
    rawPayload: unknown;
    connection: typeof channelConnections.$inferSelect | null;
  },
) {
  if (!input.connection) return 0;
  const plugin = getChannelPluginRegistry().get(input.platform);
  if (!plugin.parseDeliveryReceipts) return 0;
  const receipts = await plugin.parseDeliveryReceipts(
    {
      headers: c.req.header(),
      query: Object.fromEntries(new URL(c.req.url).searchParams),
      rawBody: new TextEncoder().encode(JSON.stringify(input.rawPayload)),
      receivedAt: new Date(),
    },
    {
      connectionId: input.connection.id,
      orgId: input.connection.orgId,
      brandId: input.connection.brandId,
      channelType: input.connection.channelType,
      credentials: openChannelCredentials(
        input.connection.credentials,
        c.get("authConfig").jwtSecret,
      ),
      settings: input.connection.settings,
    },
  );
  for (const receipt of receipts) {
    await recordDeliveryReceipt(c.get("store"), {
      orgId: input.orgId,
      connectionId: input.connection.id,
      receipt,
    });
  }
  return receipts.length;
}

function verifyConfiguredChannelSignature(
  c: ImWebhookContext,
  channelType: ImPlatform,
  rawBody: string,
  credentials: Record<string, unknown>,
): boolean {
  if (channelType === "telegram") {
    if (typeof credentials.webhookSecret === "string") {
      return safeEqual(
        c.req.header("x-telegram-bot-api-secret-token") ?? "",
        credentials.webhookSecret,
      );
    }
    return c.get("env").NODE_ENV !== "production";
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
  if (channelType === "slack") return c.get("env").NODE_ENV !== "production";
  if (channelType === "whatsapp" && typeof credentials.appSecret === "string") {
    const expected = `sha256=${createHmac("sha256", credentials.appSecret)
      .update(rawBody)
      .digest("hex")}`;
    return safeEqual(c.req.header("x-hub-signature-256") ?? "", expected);
  }
  if (channelType === "whatsapp" && c.get("env").NODE_ENV === "production") return false;
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
  if (channelType === "discord") return c.get("env").NODE_ENV !== "production";
  if (channelType === "dingtalk") {
    if (typeof credentials.signingSecret === "string") {
      const timestamp = c.req.query("timestamp") ?? "";
      const signature = c.req.query("sign") ?? "";
      const expected = createHmac("sha256", credentials.signingSecret)
        .update(`${timestamp}\n${credentials.signingSecret}`)
        .digest("base64");
      return safeEqual(signature, expected);
    }
    return c.get("env").NODE_ENV !== "production";
  }
  return true;
}

function verifyFeishuToken(
  body: unknown,
  configuredToken: unknown,
  requireConfiguredToken = false,
): boolean {
  if (typeof configuredToken !== "string") return !requireConfiguredToken;
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  const header = record.header;
  const token =
    record.token ??
    (header && typeof header === "object" ? (header as Record<string, unknown>).token : undefined);
  return typeof token === "string" && safeEqual(token, configuredToken);
}

function stringCredential(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

async function dispatchDeferredIngress(c: ImWebhookContext, result: unknown): Promise<void> {
  if (!result || typeof result !== "object") return;
  const eventId = (result as { eventId?: unknown }).eventId;
  const duplicate = (result as { duplicate?: unknown }).duplicate;
  if (typeof eventId !== "string" || duplicate === true) return;
  try {
    await getChannelDispatch().dispatchIngress(eventId);
  } catch (error) {
    c.get("log").error(
      { err: error, ingressEventId: eventId },
      "channel ingress dispatch failed; recovery will retry",
    );
  }
}

async function acceptCentralSlackWebhook(c: ImWebhookContext) {
  const rawBody = await c.req.text();
  const body = parseProviderJson<Parameters<typeof adaptSlackEvent>[0]>(
    rawBody,
    "slack",
    c.req.header("content-type"),
  );
  const teamId = slackTeamId(body);
  if (!teamId) return c.json({ error: "slack_team_id_missing" }, 400);
  const connection = await loadCentralWebhookConnection(c, {
    channelType: "slack",
    externalAccountId: teamId,
  });
  const stored = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const credentials = {
    ...stored,
    signingSecret: stored.signingSecret ?? c.get("env").SLACK_SIGNING_SECRET,
  };
  if (!verifyConfiguredChannelSignature(c, "slack", rawBody, credentials)) {
    return c.json({ error: "invalid_provider_signature" }, 403);
  }
  const challenge = slackUrlVerificationChallenge(body);
  if (challenge) return c.json({ challenge });
  const parsed = adaptSlackEvent(body);
  if (!parsed) return c.json({ ok: true, ignored: true });
  const result = await acceptInboundMessage(c, {
    orgId: connection.orgId,
    brandId: connection.brandId,
    platform: "slack",
    parsed,
    rawPayload: body,
    connection,
    deferDispatch: true,
  });
  await dispatchDeferredIngress(c, result);
  return c.json({ accepted: true, ...result }, 202);
}

async function acceptCentralDiscordWebhook(c: ImWebhookContext) {
  const rawBody = await c.req.text();
  const body = parseProviderJson<Parameters<typeof adaptDiscordEvent>[0]>(
    rawBody,
    "discord",
    c.req.header("content-type"),
  );
  const interactionType = discordInteractionType(body);
  if (interactionType === 1) {
    if (
      !verifyConfiguredChannelSignature(c, "discord", rawBody, {
        publicKey: c.get("env").DISCORD_PUBLIC_KEY,
      })
    ) {
      return c.json({ error: "invalid_provider_signature" }, 403);
    }
    return c.json({ type: 1 });
  }

  const guildId = discordGuildId(body);
  if (!guildId) return c.json({ error: "discord_guild_id_missing" }, 400);
  const connection = await loadCentralWebhookConnection(c, {
    channelType: "discord",
    externalAccountId: guildId,
  });
  const stored = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const credentials = {
    ...stored,
    publicKey: stored.publicKey ?? c.get("env").DISCORD_PUBLIC_KEY,
  };
  if (!verifyConfiguredChannelSignature(c, "discord", rawBody, credentials)) {
    return c.json({ error: "invalid_provider_signature" }, 403);
  }
  const parsed = adaptDiscordEvent(body);
  if (!parsed) {
    return c.json({
      type: 4,
      data: { content: "This interaction is not supported.", flags: 64 },
    });
  }
  const result = await acceptInboundMessage(c, {
    orgId: connection.orgId,
    brandId: connection.brandId,
    platform: "discord",
    parsed,
    rawPayload: body,
    connection,
    deferDispatch: true,
  });
  await dispatchDeferredIngress(c, result);
  return c.json({ type: 6 });
}

async function acknowledgeTelegramInteraction(
  c: ImWebhookContext,
  connection: typeof channelConnections.$inferSelect | null,
  callbackQueryId: string | undefined,
): Promise<void> {
  if (!callbackQueryId) return;
  const credentials = connection
    ? openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret)
    : {};
  const botToken =
    typeof credentials.botToken === "string"
      ? credentials.botToken
      : c.get("env").TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    c.get("log").warn({ callbackQueryId }, "Telegram callback could not be acknowledged");
    return;
  }
  try {
    await answerTelegramCallbackQuery(fetch, botToken, callbackQueryId);
  } catch (error) {
    c.get("log").error({ err: error, callbackQueryId }, "Telegram callback acknowledgement failed");
  }
}

export function imWebhookRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/webhooks/im`;
  r.use(
    `${prefix}/*`,
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
  );

  r.get(`${prefix}/workflow-button`, async (c) => {
    const token = c.req.query("token");
    const action = token ? verifyChannelWorkflowButton(token, c.get("authConfig").jwtSecret) : null;
    if (!action) return interactionResult(c, false, 400);
    return c.html(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>KeenAI</title></head><body style="font:16px system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#f7f8fb;color:#182033"><main style="max-width:32rem;padding:2rem;text-align:center"><h1>Confirm selection</h1><p>${escapeHtml(action.buttonId)}</p><form method="post" action="/api/v1/webhooks/im/workflow-button"><input type="hidden" name="token" value="${escapeHtml(token ?? "")}"><button type="submit" style="padding:.7rem 1.2rem;border:0;border-radius:6px;background:#4652f2;color:white;cursor:pointer">Confirm</button></form></main></body></html>`,
    );
  });

  r.post(`${prefix}/workflow-button`, async (c) => {
    const form = await c.req.formData();
    const token = form.get("token");
    const action =
      typeof token === "string"
        ? verifyChannelWorkflowButton(token, c.get("authConfig").jwtSecret)
        : null;
    if (!action) return interactionResult(c, false, 400);
    const [run] = await c
      .get("store")
      .db.select({ conversationId: workflowRuns.conversationId })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, action.workflowRunId), eq(workflowRuns.orgId, action.orgId)))
      .limit(1);
    if (run?.conversationId !== action.conversationId) return interactionResult(c, false, 409);
    const result = await resumeReplyButtonsWorkflow(
      c.get("store").db,
      {
        orgId: action.orgId,
        workflowRunId: action.workflowRunId,
        blockId: action.blockId,
        buttonId: action.buttonId,
      },
      c.get("env"),
      c.get("authConfig"),
    );
    return interactionResult(c, result.resumed, result.resumed ? 200 : 409);
  });

  r.post(`${prefix}/telegram`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const verified = await readVerifiedChannelJson<Parameters<typeof adaptTelegramUpdate>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "telegram",
    });
    const { body } = verified;
    const updates = splitTelegramUpdate(body);
    const results = [];
    for (const update of updates) {
      const parsed = adaptTelegramUpdate(update);
      if (!parsed) continue;
      results.push(
        await acceptInboundMessage(c, {
          orgId: resolved.org.id,
          brandId: resolved.brand.id,
          platform: "telegram",
          parsed,
          rawPayload: update,
          connection: verified.connection,
          deferDispatch: updates.length > 1,
        }),
      );
    }
    if (results.length === 0) return c.json({ ok: true, ignored: true });

    if (updates.length > 1) {
      for (const result of results) await dispatchDeferredIngress(c, result);
    }

    await acknowledgeTelegramInteraction(c, verified.connection, body.callback_query?.id);

    return c.json(
      results.length === 1
        ? { accepted: true, ...results[0] }
        : { accepted: true, acceptedCount: results.length, items: results },
      202,
    );
  });

  r.post(`${prefix}/discord`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return acceptCentralDiscordWebhook(c);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const verified = await readVerifiedChannelJson<Parameters<typeof adaptDiscordEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "discord",
    });
    const { body } = verified;
    const interactionType = discordInteractionType(body);
    if (interactionType === 1) return c.json({ type: 1 });
    const parsed = adaptDiscordEvent(body);
    if (!parsed) {
      return interactionType
        ? c.json({
            type: 4,
            data: { content: "This interaction is not supported.", flags: 64 },
          })
        : c.json({ ok: true, ignored: true });
    }

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "discord",
      parsed,
      rawPayload: body,
      connection: verified.connection,
      deferDispatch: interactionType === 3,
    });

    if (interactionType === 3) {
      await dispatchDeferredIngress(c, result);
      return c.json({ type: 6 });
    }

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/slack`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return acceptCentralSlackWebhook(c);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const verified = await readVerifiedChannelJson<Parameters<typeof adaptSlackEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "slack",
    });
    const { body } = verified;
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
      connection: verified.connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/feishu`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return acceptCentralFeishuWebhook(c);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const verified = await readVerifiedChannelJson<Parameters<typeof adaptFeishuEvent>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "feishu",
    });
    const { body } = verified;
    const challenge = feishuUrlVerificationChallenge(body);
    if (challenge) return c.json({ challenge });

    const receipts = await acceptDeliveryReceipts(c, {
      orgId: resolved.org.id,
      platform: "feishu",
      rawPayload: body,
      connection: verified.connection,
    });
    if (receipts > 0) return c.json({ accepted: true, receipts }, 202);

    const parsed = adaptFeishuEvent(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "feishu",
      parsed,
      rawPayload: body,
      connection: verified.connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/dingtalk`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const verified = await readVerifiedChannelJson<Parameters<typeof adaptDingTalkRobot>[0]>(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      channelType: "dingtalk",
    });
    const { body } = verified;
    const parsed = adaptDingTalkRobot(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "dingtalk",
      parsed,
      rawPayload: body,
      connection: verified.connection,
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
    if (orgSlug && !expected) {
      const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
      if (!("error" in resolved)) {
        const connection = await loadWebhookConnection(c, {
          orgId: resolved.org.id,
          brandId: resolved.brand.id,
          channelType: "whatsapp",
        });
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
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    const resolved = orgSlug
      ? await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug)
      : null;
    if (resolved && "error" in resolved) return c.json({ error: resolved.error }, 404);

    const rawBody = await c.req.text();
    let body: WhatsAppWebhookPayload;
    try {
      body = JSON.parse(rawBody) as WhatsAppWebhookPayload;
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const segments = splitWhatsAppWebhookPayload(body);
    if (segments.length === 0) {
      const appSecret = c.get("env").META_APP_SECRET;
      if (
        c.get("env").NODE_ENV === "production" &&
        (!appSecret ||
          !verifyConfiguredChannelSignature(c, "whatsapp", rawBody, {
            appSecret,
          }))
      ) {
        return c.json({ error: "invalid_provider_signature" }, 403);
      }
      return c.json({ ok: true, ignored: true });
    }

    const connections = new Map<string, typeof channelConnections.$inferSelect>();
    for (const segment of segments) {
      if (connections.has(segment.phoneNumberId)) continue;
      const connection = await loadCentralWhatsAppConnection(c, {
        phoneNumberId: segment.phoneNumberId,
        ...(resolved && !("error" in resolved)
          ? { orgId: resolved.org.id, brandId: resolved.brand.id }
          : {}),
      });
      const credentials = openChannelCredentials(
        connection.credentials,
        c.get("authConfig").jwtSecret,
      );
      if (!verifyConfiguredChannelSignature(c, "whatsapp", rawBody, credentials)) {
        return c.json({ error: "invalid_provider_signature" }, 403);
      }
      if (credentials.phoneNumberId !== segment.phoneNumberId) {
        return c.json({ error: "channel_account_mismatch" }, 403);
      }
      connections.set(segment.phoneNumberId, connection);
    }

    let receipts = 0;
    let accepted = 0;
    let lastResult: Awaited<ReturnType<typeof acceptInboundMessage>> | null = null;
    const pendingEventIds: string[] = [];
    for (const segment of segments) {
      const connection = connections.get(segment.phoneNumberId);
      if (!connection) continue;
      receipts += await acceptDeliveryReceipts(c, {
        orgId: connection.orgId,
        platform: "whatsapp",
        rawPayload: segment.payload,
        connection,
      });
      for (const entry of segment.payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const message of change.value?.messages ?? []) {
            const single = {
              object: segment.payload.object,
              entry: [
                {
                  id: entry.id,
                  changes: [
                    {
                      field: change.field,
                      value: {
                        ...change.value,
                        messages: [message],
                        statuses: [],
                      },
                    },
                  ],
                },
              ],
            };
            const parsed = adaptWhatsAppWebhook(single);
            if (!parsed) continue;
            lastResult = await acceptInboundMessage(c, {
              orgId: connection.orgId,
              brandId: connection.brandId,
              platform: "whatsapp",
              parsed,
              rawPayload: single,
              connection,
              deferDispatch: true,
            });
            if (lastResult && "eventId" in lastResult && !lastResult.duplicate) {
              pendingEventIds.push(lastResult.eventId);
            }
            accepted++;
          }
        }
      }
    }
    for (const eventId of pendingEventIds) {
      try {
        await getChannelDispatch().dispatchIngress(eventId);
      } catch (error) {
        c.get("log").error(
          { err: error, ingressEventId: eventId },
          "channel ingress dispatch failed; recovery will retry",
        );
      }
    }
    if (accepted === 0 && receipts === 0) return c.json({ ok: true, ignored: true });
    if (accepted === 1 && receipts === 0) return c.json({ accepted: true, ...lastResult }, 202);
    return c.json({ accepted: true, messages: accepted, receipts }, 202);
  });

  r.get(`${prefix}/wechat`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);
    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);
    const config = await loadWeChatCryptoConfig(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    if (!config) return c.json({ error: "wechat_not_configured" }, 503);
    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    const echo = c.req.query("echostr");
    if (!timestamp || !nonce || !echo || !validProviderTimestamp(timestamp)) {
      return c.json({ error: "invalid_wechat_verification" }, 400);
    }
    const messageSignature = c.req.query("msg_signature");
    if (messageSignature) {
      if (
        !config.encodingAesKey ||
        !verifyWeChatMessageSignature({
          token: config.token,
          timestamp,
          nonce,
          encrypted: echo,
          signature: messageSignature,
        })
      ) {
        return c.json({ error: "invalid_wechat_signature" }, 403);
      }
      try {
        return c.text(
          decryptWeChatPayload(echo, {
            token: config.token,
            encodingAesKey: config.encodingAesKey,
            appId: config.appId,
          }),
        );
      } catch {
        return c.json({ error: "invalid_wechat_ciphertext" }, 403);
      }
    }
    const signature = c.req.query("signature");
    if (
      !signature ||
      !verifyWeChatSignature({
        token: config.token,
        timestamp,
        nonce,
        signature,
      })
    ) {
      return c.json({ error: "invalid_wechat_signature" }, 403);
    }
    return c.text(echo);
  });

  r.post(`${prefix}/wechat`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);
    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);
    const config = await loadWeChatCryptoConfig(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    if (!config) return c.json({ error: "wechat_not_configured" }, 503);

    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    if (!timestamp || !nonce || !validProviderTimestamp(timestamp)) {
      return c.json({ error: "invalid_wechat_callback" }, 400);
    }
    const xml = await c.req.text();
    const encrypted = readWeChatXmlTag(xml, "Encrypt");
    let body: Parameters<typeof adaptWeChatMessage>[0];
    if (encrypted) {
      const signature = c.req.query("msg_signature");
      if (
        !signature ||
        !config.encodingAesKey ||
        !verifyWeChatMessageSignature({
          token: config.token,
          timestamp,
          nonce,
          encrypted,
          signature,
        })
      ) {
        return c.json({ error: "invalid_wechat_signature" }, 403);
      }
      try {
        body = parseWeChatMessageXml(
          decryptWeChatPayload(encrypted, {
            token: config.token,
            encodingAesKey: config.encodingAesKey,
            appId: config.appId,
          }),
        );
      } catch {
        return c.json({ error: "invalid_wechat_ciphertext" }, 403);
      }
    } else {
      const signature = c.req.query("signature");
      if (
        !signature ||
        !verifyWeChatSignature({
          token: config.token,
          timestamp,
          nonce,
          signature,
        })
      ) {
        return c.json({ error: "invalid_wechat_signature" }, 403);
      }
      body = parseWeChatMessageXml(xml);
    }
    const parsed = adaptWeChatMessage(body);
    if (!parsed) return c.text("success");
    await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "wechat",
      parsed,
      rawPayload: body,
      connection: config.connection,
    });
    return c.text("success");
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

  r.get(`${prefix}/wecom/suite`, async (c) => {
    const config = weComSuiteCryptoConfig(c);
    if (!config) return c.json({ error: "wecom_suite_not_configured" }, 503);
    const signature = c.req.query("msg_signature");
    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    const echo = c.req.query("echostr");
    if (!signature || !timestamp || !nonce || !echo) {
      return c.json({ error: "invalid_wecom_verification" }, 400);
    }
    if (
      !validProviderTimestamp(timestamp) ||
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

  r.post(`${prefix}/dingtalk/suite`, async (c) => {
    const config = dingTalkSuiteCryptoConfig(c);
    if (!config) return c.json({ error: "dingtalk_suite_not_configured" }, 503);
    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    const signature = c.req.query("signature") ?? c.req.query("msg_signature");
    const rawBody = await c.req.text();
    let wrapper: Record<string, unknown>;
    try {
      wrapper = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return c.json({ error: "invalid_dingtalk_callback" }, 400);
    }
    const encrypted = stringValue(wrapper.encrypt);
    if (!timestamp || !nonce || !signature || !encrypted) {
      return c.json({ error: "invalid_dingtalk_callback" }, 400);
    }
    if (
      !validProviderTimestamp(timestamp) ||
      !verifyDingTalkSignature({
        token: config.token,
        timestamp,
        nonce,
        encrypted,
        signature,
      })
    ) {
      return c.json({ error: "invalid_dingtalk_signature" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = decryptDingTalkPayload(encrypted, config);
    } catch {
      return c.json({ error: "invalid_dingtalk_ciphertext" }, 403);
    }
    const eventType = stringValue(body.EventType) ?? stringValue(body.eventType);
    if (!eventType) return c.json({ error: "dingtalk_event_type_missing" }, 400);

    if (eventType === "suite_ticket") {
      const suiteTicket = stringValue(body.SuiteTicket) ?? stringValue(body.suiteTicket);
      if (!suiteTicket) return c.json({ error: "dingtalk_suite_ticket_missing" }, 400);
      await putChannelProviderAppState({
        store: c.get("store"),
        provider: "dingtalk",
        appId: config.suiteKey,
        stateType: "suite_ticket",
        payload: {
          suiteTicket,
          eventTime: body.TimeStamp ?? body.EventTime ?? body.timestamp,
        },
        secret: c.get("authConfig").jwtSecret,
        expiresAt: new Date(Date.now() + 6 * 60 * 60_000),
      });
    } else if (eventType === "suite_relieve") {
      const corpId = stringValue(body.AuthCorpId) ?? stringValue(body.authCorpId);
      if (!corpId) return c.json({ error: "dingtalk_auth_corp_missing" }, 400);
      const rows = await c
        .get("store")
        .db.update(channelConnections)
        .set({
          status: "disabled",
          lastError: "provider_uninstalled",
          runtimeState: "stopped",
          runtimeOwnerId: null,
          runtimeLeaseToken: null,
          runtimeLeaseExpiresAt: null,
          runtimeHeartbeatAt: null,
          runtimeNextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(channelConnections.channelType, "dingtalk"),
            eq(channelConnections.externalAccountId, corpId),
            ne(channelConnections.status, "disabled"),
          ),
        )
        .returning({
          id: channelConnections.id,
          orgId: channelConnections.orgId,
        });
      for (const row of rows) {
        await c
          .get("store")
          .db.insert(auditLogs)
          .values({
            orgId: row.orgId,
            actorType: "system",
            action: "channel.connection.provider_uninstalled",
            resourceType: "channel_connection",
            resourceId: row.id,
            changes: { channelType: "dingtalk", eventType, status: "disabled" },
          });
      }
    }

    const responseMessage =
      eventType === "check_create_suite_url" || eventType === "check_update_suite_url"
        ? (stringValue(body.Random) ?? stringValue(body.random) ?? "success")
        : "success";
    return c.json(encryptDingTalkResponse(responseMessage, config, { timestamp, nonce }));
  });

  r.post(`${prefix}/wecom/suite`, async (c) => {
    const config = weComSuiteCryptoConfig(c);
    if (!config) return c.json({ error: "wecom_suite_not_configured" }, 503);
    const xml = await c.req.text();
    const encrypted = readWeComXmlTag(xml, "Encrypt");
    const signature = c.req.query("msg_signature");
    const timestamp = c.req.query("timestamp");
    const nonce = c.req.query("nonce");
    if (!encrypted || !signature || !timestamp || !nonce) {
      return c.json({ error: "invalid_wecom_callback" }, 400);
    }
    if (
      !validProviderTimestamp(timestamp) ||
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
    const body = parseWeComMessageXml(decryptWeComPayload(encrypted, config));
    const infoType = body.InfoType;
    if (infoType === "suite_ticket") {
      if (!body.SuiteTicket) return c.json({ error: "wecom_suite_ticket_missing" }, 400);
      await putChannelProviderAppState({
        store: c.get("store"),
        provider: "wecom",
        appId: config.corpId,
        stateType: "suite_ticket",
        payload: { suiteTicket: body.SuiteTicket, timestamp: body.TimeStamp },
        secret: c.get("authConfig").jwtSecret,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      return c.text("success");
    }
    if (infoType === "create_auth" || infoType === "change_auth") {
      return c.text("success");
    }
    if (infoType === "cancel_auth") {
      if (!body.AuthCorpId) return c.json({ error: "wecom_auth_corp_missing" }, 400);
      const rows = await c
        .get("store")
        .db.update(channelConnections)
        .set({
          status: "disabled",
          lastError: "provider_uninstalled",
          runtimeState: "stopped",
          runtimeOwnerId: null,
          runtimeLeaseToken: null,
          runtimeLeaseExpiresAt: null,
          runtimeHeartbeatAt: null,
          runtimeNextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(channelConnections.channelType, "wecom"),
            eq(channelConnections.externalAccountId, body.AuthCorpId),
            ne(channelConnections.status, "disabled"),
          ),
        )
        .returning({
          id: channelConnections.id,
          orgId: channelConnections.orgId,
        });
      for (const row of rows) {
        await c
          .get("store")
          .db.insert(auditLogs)
          .values({
            orgId: row.orgId,
            actorType: "system",
            action: "channel.connection.provider_uninstalled",
            resourceType: "channel_connection",
            resourceId: row.id,
            changes: {
              channelType: "wecom",
              eventType: infoType,
              status: "disabled",
            },
          });
      }
      return c.text("success");
    }

    const corpId = body.ToUserName ?? body.AuthCorpId;
    if (!corpId) return c.text("success");
    const matches = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.channelType, "wecom"),
          eq(channelConnections.externalAccountId, corpId),
          eq(channelConnections.status, "active"),
        ),
      )
      .limit(2);
    if (matches.length > 1) return c.json({ error: "ambiguous_channel_connection" }, 409);
    const connection = matches[0];
    if (!connection) return c.json({ error: "channel_not_configured" }, 503);
    const parsed = adaptWeComMessage(body);
    if (!parsed) return c.text("success");
    await acceptInboundMessage(c, {
      orgId: connection.orgId,
      brandId: connection.brandId,
      platform: "wecom",
      parsed,
      rawPayload: body,
      connection,
    });
    return c.text("success", 202);
  });

  r.post(`${prefix}/wecom`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const contentType = c.req.header("content-type") ?? "";
    let body: WeComMessagePayload;
    let connection: typeof channelConnections.$inferSelect | null = null;
    let officialCallback = false;
    if (contentType.includes("xml") || contentType.includes("text/plain")) {
      officialCallback = true;
      const config = await loadWeComCryptoConfig(c, {
        orgId: resolved.org.id,
        brandId: resolved.brand.id,
      });
      if (!config) return c.json({ error: "wecom_not_configured" }, 503);
      connection = config.connection;
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
      connection = await loadWebhookConnection(c, {
        orgId: resolved.org.id,
        brandId: resolved.brand.id,
        channelType: "wecom",
      });
    }
    const parsed = adaptWeComMessage(body);
    if (!parsed) return c.json({ ok: true, ignored: true });

    const result = await acceptInboundMessage(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      platform: "wecom",
      parsed,
      rawPayload: body,
      connection,
    });
    return officialCallback ? c.text("success", 202) : c.json({ accepted: true, ...result }, 202);
  });

  return r;
}

async function acceptCentralFeishuWebhook(c: ImWebhookContext) {
  const env = c.get("env");
  if (!env.FEISHU_ISV_APP_ID || !env.FEISHU_ISV_APP_SECRET) {
    return c.json({ error: "feishu_isv_not_configured" }, 503);
  }
  const rawBody = await c.req.text();
  let received: ReturnType<typeof parseFeishuMarketplaceWebhook>;
  try {
    received = parseFeishuMarketplaceWebhook({
      rawBody,
      headers: c.req.header(),
      appId: env.FEISHU_ISV_APP_ID,
      verificationToken: env.FEISHU_ISV_VERIFICATION_TOKEN,
      encryptKey: env.FEISHU_ISV_ENCRYPT_KEY,
    });
  } catch {
    return c.json({ error: "invalid_provider_signature" }, 403);
  }

  if (received.eventType === "url_verification" && received.challenge) {
    return c.json({ challenge: received.challenge });
  }
  if (received.eventType === "app_ticket") {
    if (!received.appTicket) return c.json({ error: "feishu_app_ticket_missing" }, 400);
    await putChannelProviderAppState({
      store: c.get("store"),
      provider: "feishu",
      appId: env.FEISHU_ISV_APP_ID,
      stateType: "app_ticket",
      payload: { appTicket: received.appTicket, eventId: received.eventId },
      secret: c.get("authConfig").jwtSecret,
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });
    return c.json({ ok: true });
  }
  if (
    received.eventType === "app_open" ||
    received.eventType === "app_uninstalled" ||
    received.eventType === "app_status_change"
  ) {
    if (!received.tenantKey) return c.json({ error: "feishu_tenant_key_missing" }, 400);
    const disabled =
      received.eventType === "app_uninstalled" || isDisabledFeishuStatus(received.status);
    const nextStatus = disabled ? "disabled" : "active";
    const rows = await c
      .get("store")
      .db.update(channelConnections)
      .set({
        status: nextStatus,
        lastError: disabled ? "provider_uninstalled" : null,
        runtimeState: disabled ? "stopped" : undefined,
        runtimeOwnerId: disabled ? null : undefined,
        runtimeLeaseToken: disabled ? null : undefined,
        runtimeLeaseExpiresAt: disabled ? null : undefined,
        runtimeHeartbeatAt: disabled ? null : undefined,
        runtimeNextAttemptAt: disabled ? null : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(channelConnections.channelType, "feishu"),
          eq(channelConnections.externalAccountId, received.tenantKey),
          ne(channelConnections.status, nextStatus),
        ),
      )
      .returning({
        id: channelConnections.id,
        orgId: channelConnections.orgId,
      });
    for (const row of rows) {
      await c
        .get("store")
        .db.insert(auditLogs)
        .values({
          orgId: row.orgId,
          actorType: "system",
          action: disabled
            ? "channel.connection.provider_uninstalled"
            : "channel.connection.provider_installed",
          resourceType: "channel_connection",
          resourceId: row.id,
          changes: {
            channelType: "feishu",
            eventType: received.eventType,
            status: nextStatus,
          },
        });
    }
    return c.json({ ok: true, updated: rows.length });
  }

  if (!received.tenantKey) return c.json({ ok: true, ignored: true });
  const matches = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.channelType, "feishu"),
        eq(channelConnections.externalAccountId, received.tenantKey),
        eq(channelConnections.status, "active"),
      ),
    )
    .limit(2);
  if (matches.length > 1) return c.json({ error: "ambiguous_channel_connection" }, 409);
  const connection = matches[0];
  if (!connection) return c.json({ error: "channel_not_configured" }, 503);

  const receipts = await acceptDeliveryReceipts(c, {
    orgId: connection.orgId,
    platform: "feishu",
    rawPayload: received.payload,
    connection,
  });
  if (receipts > 0) return c.json({ accepted: true, receipts }, 202);
  const parsed = adaptFeishuEvent(received.payload as Parameters<typeof adaptFeishuEvent>[0]);
  if (!parsed) return c.json({ ok: true, ignored: true });
  const result = await acceptInboundMessage(c, {
    orgId: connection.orgId,
    brandId: connection.brandId,
    platform: "feishu",
    parsed,
    rawPayload: received.payload,
    connection,
  });
  return c.json({ accepted: true, ...result }, 202);
}

function isDisabledFeishuStatus(status: string | undefined): boolean {
  return Boolean(status && /(?:stop|disable|deactiv|uninstall|closed?)/i.test(status));
}

function weComSuiteCryptoConfig(c: ImWebhookContext) {
  const env = c.get("env");
  if (!env.WECOM_SUITE_ID || !env.WECOM_SUITE_TOKEN || !env.WECOM_SUITE_ENCODING_AES_KEY) {
    return null;
  }
  return {
    token: env.WECOM_SUITE_TOKEN,
    encodingAesKey: env.WECOM_SUITE_ENCODING_AES_KEY,
    corpId: env.WECOM_SUITE_ID,
  };
}

function dingTalkSuiteCryptoConfig(c: ImWebhookContext) {
  const env = c.get("env");
  if (
    !env.DINGTALK_ISV_SUITE_KEY ||
    !env.DINGTALK_ISV_CALLBACK_TOKEN ||
    !env.DINGTALK_ISV_ENCODING_AES_KEY
  ) {
    return null;
  }
  return {
    token: env.DINGTALK_ISV_CALLBACK_TOKEN,
    encodingAesKey: env.DINGTALK_ISV_ENCODING_AES_KEY,
    suiteKey: env.DINGTALK_ISV_SUITE_KEY,
  };
}

function validProviderTimestamp(timestamp: string): boolean {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && Math.abs(Date.now() / 1_000 - seconds) <= 300;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function interactionResult(c: ImWebhookContext, accepted: boolean, status: 200 | 400 | 409) {
  return c.html(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>KeenAI</title></head><body style="font:16px system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#f7f8fb;color:#182033"><main style="max-width:32rem;padding:2rem;text-align:center"><h1>${accepted ? "Selection received" : "Selection unavailable"}</h1><p>${accepted ? "Your workflow is continuing. You can close this page." : "This action is invalid, expired, or was already completed."}</p></main></body></html>`,
    status,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
