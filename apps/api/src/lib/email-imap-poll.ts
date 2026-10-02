import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { parseMimeSource, pollImapMailboxes } from "@keenai/channels-email";
import {
  claimChannelConnectionRuntime,
  failChannelConnectionRuntime,
  heartbeatChannelConnectionRuntime,
  releaseChannelConnectionRuntime,
} from "@keenai/channels-runtime";
import { channelConnections } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../types.js";
import { admitEmailIngress } from "./channel-dispatch.js";
import { loadEmailCredentials } from "./email-oauth.js";

const EMAIL_POLL_LEASE_MS = 10 * 60_000;

export type EmailImapPollSummary = {
  polled: number;
  ingested: number;
  oversized: number;
  connections: number;
  failedConnections: number;
  skipped: boolean;
  reason?: string;
};

export async function runEmailImapPoll(
  ctx: AppContext,
  input: { orgId?: string; ownerId?: string } = {},
): Promise<EmailImapPollSummary> {
  const filters = [
    eq(channelConnections.channelType, "email"),
    eq(channelConnections.transport, "polling"),
    eq(channelConnections.status, "active"),
  ];
  if (input.orgId) filters.push(eq(channelConnections.orgId, input.orgId));
  const connections = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(and(...filters));
  if (connections.length === 0) {
    return {
      polled: 0,
      ingested: 0,
      oversized: 0,
      connections: 0,
      failedConnections: 0,
      skipped: true,
      reason: "imap_connection_not_configured",
    };
  }

  const ownerId = input.ownerId ?? `${hostname()}:${process.pid}:email:${randomUUID()}`;
  let polled = 0;
  let ingested = 0;
  let oversized = 0;
  let completedConnections = 0;
  let failedConnections = 0;

  for (const connection of connections) {
    const claimed = await claimChannelConnectionRuntime(ctx.store, {
      connectionId: connection.id,
      ownerId,
      leaseMs: EMAIL_POLL_LEASE_MS,
    });
    if (!claimed) continue;

    try {
      const credentials = await loadEmailCredentials(
        ctx.store,
        claimed.connection,
        ctx.authConfig.jwtSecret,
        ctx.env,
      );
      const host = requiredCredential(credentials, "imapHost");
      const user = requiredCredential(credentials, "imapUser");
      const port = numericCredential(credentials, "imapPort") ?? 993;
      const mailbox = stringCredential(credentials, "imapMailbox") ?? "INBOX";
      await heartbeatChannelConnectionRuntime(ctx.store, {
        connectionId: connection.id,
        ownerId,
        leaseToken: claimed.leaseToken,
        state: "connected",
        leaseMs: EMAIL_POLL_LEASE_MS,
      });
      const result = await pollImapMailboxes(
        {
          host,
          port,
          secure: booleanCredential(credentials, "imapSecure") ?? port === 993,
          user,
          ...(stringCredential(credentials, "accessToken")
            ? { accessToken: requiredCredential(credentials, "accessToken") }
            : { password: requiredCredential(credentials, "imapPass") }),
          mailbox,
          orgId: connection.orgId,
          maxSourceBytes: ctx.env.EMAIL_IMAP_MAX_MESSAGE_BYTES,
        },
        undefined,
        {
          onMessage: async (message) => {
            const parsed = await parseMimeSource(message.source);
            await admitEmailIngress(ctx, {
              orgId: connection.orgId,
              brandId: connection.brandId,
              connectionId: connection.id,
              provider: `imap:${user}`,
              parsed,
            });
          },
        },
      );
      polled += result.polled;
      ingested += result.ingested;
      oversized += result.oversized;
      completedConnections += 1;
      await releaseChannelConnectionRuntime(ctx.store, {
        connectionId: connection.id,
        ownerId,
        leaseToken: claimed.leaseToken,
        cursor: { lastPolledAt: new Date().toISOString(), mailbox },
      });
    } catch (error) {
      failedConnections += 1;
      const message = error instanceof Error ? error.message : String(error);
      await failChannelConnectionRuntime(ctx.store, {
        connectionId: connection.id,
        ownerId,
        leaseToken: claimed.leaseToken,
        error: message,
        retryAfterMs: 60_000,
      });
      ctx.log.error({ err: error, connectionId: connection.id }, "email connection poll failed");
    }
  }

  return {
    polled,
    ingested,
    oversized,
    connections: completedConnections,
    failedConnections,
    skipped: completedConnections === 0 && failedConnections === 0,
    ...(completedConnections === 0 && failedConnections === 0
      ? { reason: "imap_connections_busy" }
      : {}),
  };
}

function requiredCredential(credentials: Record<string, unknown>, key: string): string {
  const value = stringCredential(credentials, key);
  if (!value) throw new Error(`email_${key}_required`);
  return value;
}

function stringCredential(credentials: Record<string, unknown>, key: string): string | undefined {
  const value = credentials[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numericCredential(credentials: Record<string, unknown>, key: string): number | undefined {
  const value = credentials[key];
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`email_${key}_invalid`);
  return number;
}

function booleanCredential(credentials: Record<string, unknown>, key: string): boolean | undefined {
  const value = credentials[key];
  return typeof value === "boolean" ? value : undefined;
}
