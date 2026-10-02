import { timingSafeEqual } from "node:crypto";
import type { ChannelConnectionConfig, ChannelWebhookRequest } from "@keenai/channels-core";
import {
  adaptMailgunInbound,
  adaptRawMimeBody,
  adaptSendGridInbound,
  adaptSesNotification,
  confirmSesSubscription,
  verifyMailgunSignatureFields,
} from "@keenai/channels-email";
import type { ParsedInboundEmailWithAttachments } from "@keenai/channels-email";
import { admitIngressEvent, recordDeliveryReceipt } from "@keenai/channels-runtime";
import { API_VERSION } from "@keenai/shared";
import { channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getChannelDispatch } from "../lib/channel-dispatch.js";
import { getChannelPluginRegistry } from "../lib/channel-plugins.js";
import { openChannelCredentials } from "../lib/channel-secrets.js";
import {
  ingestInboundEmail,
  limitInboundEmailAttachments,
  serializeInboundEmail,
} from "../lib/email-ingest.js";
import { resolveOrgBrandBySlug } from "../lib/org-brand.js";
import type { AppVariables } from "../types.js";

type EmailWebhookContext = Context<{ Variables: AppVariables }>;
type EmailReceiptProvider = "ses" | "sendgrid" | "mailgun";

async function acceptInboundEmail(
  c: EmailWebhookContext,
  input: {
    orgId: string;
    brandId: string;
    parsed: ParsedInboundEmailWithAttachments;
    connection: typeof channelConnections.$inferSelect | null;
  },
) {
  const parsed = limitInboundEmailAttachments(input.parsed, c.get("env").UPLOAD_MAX_BYTES);
  if (c.get("env").NODE_ENV === "test") {
    return ingestInboundEmail(c.get("store").db, {
      orgId: input.orgId,
      brandId: input.brandId,
      parsed,
      env: c.get("env"),
    });
  }
  if (!input.connection) throw new Error("email_connection_required");
  const admission = await admitIngressEvent(c.get("store"), {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: input.connection.id,
    channelType: "email",
    providerEventId: parsed.messageId,
    eventType: "message",
    rawPayload: serializeInboundEmail(parsed),
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
  r.use(
    `${prefix}/*`,
    bodyLimit({
      maxSize: 30 * 1024 * 1024,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
  );

  r.post(`${prefix}/inbound`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const connection = await loadEmailConnection(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    const verification = verifySharedInboundAuth(c, connection);
    if (!verification.accepted) {
      return c.json({ error: verification.reason }, verification.status as 403 | 409 | 503);
    }

    const raw = Buffer.from(await c.req.arrayBuffer());
    const parsed = await adaptRawMimeBody(raw);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/ses`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const connection = await loadEmailConnection(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const verification = await verifySesInbound(c, connection, rawBody);
    if (!verification.accepted) {
      return c.json({ error: verification.reason }, verification.status as 403 | 409 | 503);
    }

    try {
      const confirmed = await confirmSesSubscription(rawBody);
      if (confirmed) return c.json({ accepted: true, subscriptionConfirmed: true }, 202);
    } catch (error) {
      c.get("log").error({ err: error }, "SES inbound subscription confirmation failed");
      return c.json({ error: "ses_subscription_confirmation_failed" }, 502);
    }

    const body = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    const parsed = await adaptSesNotification(body);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/sendgrid`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const connection = await loadEmailConnection(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    const verification = verifySharedInboundAuth(c, connection);
    if (!verification.accepted) {
      return c.json({ error: verification.reason }, verification.status as 403 | 409 | 503);
    }

    const form = await c.req.parseBody();
    const parsed = await adaptSendGridInbound(form as Record<string, string>);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/mailgun`, async (c) => {
    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const connection = await loadEmailConnection(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });

    const form = await c.req.parseBody();
    const stringForm = stringFormValues(form);
    const verification = verifyMailgunInbound(c, connection, stringForm);
    if (!verification.accepted) {
      return c.json({ error: verification.reason }, verification.status as 403 | 409 | 503);
    }
    const parsed = await adaptMailgunInbound(stringForm);
    const result = await acceptInboundEmail(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
      parsed,
      connection,
    });

    return c.json({ accepted: true, ...result }, 202);
  });

  r.post(`${prefix}/receipts/:provider`, async (c) => {
    const provider = emailReceiptProvider(c.req.param("provider"));
    if (!provider) return c.json({ error: "email_receipt_provider_invalid" }, 400);

    const orgSlug = c.req.query("org");
    const brandSlug = c.req.query("brand") ?? "default";
    if (!orgSlug) return c.json({ error: "missing_org_query" }, 400);

    const resolved = await resolveOrgBrandBySlug(c.get("store").db, orgSlug, brandSlug);
    if ("error" in resolved) return c.json({ error: resolved.error }, 404);

    const connection = await loadEmailConnection(c, {
      orgId: resolved.org.id,
      brandId: resolved.brand.id,
    });
    if (!connection) return c.json({ error: "email_connection_required" }, 409);

    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const plugin = getChannelPluginRegistry().get("email");
    const webhookRequest = {
      headers: c.req.header(),
      query: {
        ...Object.fromEntries(new URL(c.req.url).searchParams),
        receiptProvider: provider,
      },
      rawBody,
      receivedAt: new Date(),
    };
    const channelConnection = {
      connectionId: connection.id,
      orgId: connection.orgId,
      brandId: connection.brandId,
      channelType: "email" as const,
      credentials: openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret),
      settings: connection.settings,
    };
    const verification = await plugin.verifyWebhook?.(webhookRequest, channelConnection);
    if (!verification?.accepted) {
      return c.json(
        {
          error: verification?.reason ?? "email_receipt_verification_unavailable",
        },
        (verification?.status ?? 503) as 400 | 403 | 503,
      );
    }
    if (provider === "ses") {
      try {
        const confirmed = await confirmSesSubscription(rawBody);
        if (confirmed) return c.json({ accepted: true, subscriptionConfirmed: true }, 202);
      } catch (error) {
        c.get("log").error({ err: error }, "SES subscription confirmation failed");
        return c.json({ error: "ses_subscription_confirmation_failed" }, 502);
      }
    }
    const receipts =
      (await plugin.parseDeliveryReceipts?.(webhookRequest, channelConnection)) ?? [];

    let recorded = 0;
    for (const receipt of receipts) {
      const inserted = await recordDeliveryReceipt(c.get("store"), {
        orgId: resolved.org.id,
        connectionId: connection.id,
        receipt: {
          ...receipt,
          payload: {
            provider,
            payload: receipt.payload,
          },
        },
      });
      if (inserted) recorded++;
    }

    return c.json({ accepted: true, receipts: receipts.length, recorded }, 202);
  });

  return r;
}

function emailReceiptProvider(value: string): EmailReceiptProvider | null {
  return value === "ses" || value === "sendgrid" || value === "mailgun" ? value : null;
}

async function loadEmailConnection(
  c: EmailWebhookContext,
  input: { orgId: string; brandId: string },
) {
  const connectionId = c.req.query("connection");
  const filters = [
    eq(channelConnections.orgId, input.orgId),
    eq(channelConnections.brandId, input.brandId),
    eq(channelConnections.channelType, "email"),
    eq(channelConnections.status, "active"),
  ];
  if (connectionId) filters.push(eq(channelConnections.id, connectionId));
  const rows = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(and(...filters));
  if (connectionId) return rows[0] ?? null;
  return rows.length === 1 ? (rows[0] ?? null) : null;
}

type EmailConnection = typeof channelConnections.$inferSelect;
type InboundVerification = { accepted: true } | { accepted: false; status: number; reason: string };

function verifySharedInboundAuth(
  c: EmailWebhookContext,
  connection: EmailConnection | null,
): InboundVerification {
  if (!connection) return testConnectionBypass(c);
  const credentials = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const secret = stringValue(credentials.inboundWebhookSecret);
  const username = stringValue(credentials.inboundWebhookUsername);
  const password = stringValue(credentials.inboundWebhookPassword);
  if (secret && safeEqual(c.req.header("x-keenai-connection-secret") ?? "", secret)) {
    return { accepted: true };
  }
  if (username && password && validBasicAuth(c.req.header("authorization"), username, password)) {
    return { accepted: true };
  }
  if (!secret && (!username || !password)) {
    return {
      accepted: false,
      status: 503,
      reason: "email_inbound_auth_configuration_required",
    };
  }
  return { accepted: false, status: 403, reason: "email_inbound_auth_invalid" };
}

async function verifySesInbound(
  c: EmailWebhookContext,
  connection: EmailConnection | null,
  rawBody: Uint8Array,
): Promise<InboundVerification> {
  if (!connection) return testConnectionBypass(c);
  const plugin = getChannelPluginRegistry().get("email");
  const result = await plugin.verifyWebhook?.(
    webhookRequest(c, rawBody, { receiptProvider: "ses" }),
    connectionConfig(c, connection),
  );
  return (
    result ?? {
      accepted: false,
      status: 503,
      reason: "ses_verification_unavailable",
    }
  );
}

function verifyMailgunInbound(
  c: EmailWebhookContext,
  connection: EmailConnection | null,
  form: Record<string, string>,
): InboundVerification {
  if (!connection) return testConnectionBypass(c);
  const credentials = openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret);
  const signingKey = stringValue(credentials.mailgunWebhookSigningKey);
  if (!signingKey) {
    return {
      accepted: false,
      status: 503,
      reason: "mailgun_webhook_signing_key_required",
    };
  }
  return verifyMailgunSignatureFields(
    {
      timestamp: form.timestamp,
      token: form.token,
      signature: form.signature,
    },
    signingKey,
  )
    ? { accepted: true }
    : {
        accepted: false,
        status: 403,
        reason: "mailgun_webhook_signature_invalid",
      };
}

function testConnectionBypass(c: EmailWebhookContext): InboundVerification {
  return c.get("env").NODE_ENV === "test"
    ? { accepted: true }
    : { accepted: false, status: 409, reason: "email_connection_required" };
}

function connectionConfig(
  c: EmailWebhookContext,
  connection: EmailConnection,
): ChannelConnectionConfig {
  return {
    connectionId: connection.id,
    orgId: connection.orgId,
    brandId: connection.brandId,
    channelType: "email",
    transport: connection.transport,
    credentials: openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret),
    settings: connection.settings,
  };
}

function webhookRequest(
  c: EmailWebhookContext,
  rawBody: Uint8Array,
  query: Record<string, string>,
): ChannelWebhookRequest {
  return {
    headers: c.req.header(),
    query,
    rawBody,
    receivedAt: new Date(),
  };
}

function stringFormValues(form: Record<string, string | File>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(form).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value] as const] : [],
    ),
  );
}

function validBasicAuth(header: string | undefined, username: string, password: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  try {
    return safeEqual(
      Buffer.from(header.slice(6), "base64").toString("utf8"),
      `${username}:${password}`,
    );
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
