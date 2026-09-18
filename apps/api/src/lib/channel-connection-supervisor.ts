import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  type ClaimedChannelConnectionRuntime,
  admitIngressEvent,
  claimChannelConnectionRuntime,
  failChannelConnectionRuntime,
  heartbeatChannelConnectionRuntime,
  listRunnableChannelConnections,
  releaseChannelConnectionRuntime,
} from "@keenai/channels-runtime";
import type { AppContext } from "../types.js";
import { getChannelDispatch } from "./channel-dispatch.js";
import { openChannelCredentials } from "./channel-secrets.js";
import { DiscordGatewayError, runDiscordGateway } from "./discord-gateway.js";

type ActiveRuntime = { abort: AbortController; promise: Promise<void> };

export function startChannelConnectionSupervisor(
  ctx: AppContext,
  input: { intervalMs?: number; ownerId?: string } = {},
) {
  const ownerId = input.ownerId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const intervalMs = Math.max(1_000, input.intervalMs ?? 5_000);
  const active = new Map<string, ActiveRuntime>();
  let stopped = false;
  let scanRunning = false;

  const launch = (claimed: ClaimedChannelConnectionRuntime) => {
    const abort = new AbortController();
    const promise = runClaimedConnection(ctx, ownerId, claimed, abort.signal)
      .catch((error) =>
        ctx.log.error(
          { err: error, connectionId: claimed.connection.id },
          "channel connection runtime stopped with error",
        ),
      )
      .finally(() => active.delete(claimed.connection.id));
    active.set(claimed.connection.id, { abort, promise });
  };

  const scan = async () => {
    if (stopped || scanRunning) return;
    scanRunning = true;
    try {
      const connections = await listRunnableChannelConnections(ctx.store);
      for (const connection of connections) {
        if (stopped || active.has(connection.id) || !supportsRuntime(connection)) continue;
        const claimed = await claimChannelConnectionRuntime(ctx.store, {
          connectionId: connection.id,
          ownerId,
        });
        if (claimed) launch(claimed);
      }
    } catch (error) {
      ctx.log.error({ err: error }, "channel connection supervisor scan failed");
    } finally {
      scanRunning = false;
    }
  };

  const timer = setInterval(() => void scan(), intervalMs);
  timer.unref?.();
  void scan();

  return async () => {
    stopped = true;
    clearInterval(timer);
    for (const runtime of active.values()) runtime.abort.abort();
    await Promise.allSettled([...active.values()].map((runtime) => runtime.promise));
  };
}

function supportsRuntime(connection: ClaimedChannelConnectionRuntime["connection"]): boolean {
  return connection.channelType === "discord" && connection.transport === "gateway";
}

async function runClaimedConnection(
  ctx: AppContext,
  ownerId: string,
  claimed: ClaimedChannelConnectionRuntime,
  signal: AbortSignal,
) {
  const connection = claimed.connection;
  let cursor = connection.runtimeCursor;
  try {
    if (connection.channelType !== "discord" || connection.transport !== "gateway") {
      throw new DiscordGatewayError("unsupported_channel_connection_runtime", 300_000);
    }
    const credentials = openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret);
    const botToken = credential(credentials, "botToken");
    cursor = await runDiscordGateway({
      botToken,
      initialCursor: cursor,
      signal,
      onHeartbeat: (nextCursor, state) => {
        cursor = nextCursor;
        return heartbeatChannelConnectionRuntime(ctx.store, {
          connectionId: connection.id,
          ownerId,
          leaseToken: claimed.leaseToken,
          cursor: nextCursor,
          state,
        });
      },
      onMessage: async (payload) => {
        const messageId = discordMessageId(payload);
        if (!messageId) return;
        const admission = await admitIngressEvent(ctx.store, {
          orgId: connection.orgId,
          brandId: connection.brandId,
          connectionId: connection.id,
          channelType: "discord",
          providerEventId: messageId,
          eventType: "message",
          rawPayload: payload,
        });
        if (!admission.duplicate) await getChannelDispatch().dispatchIngress(admission.event.id);
      },
    });
    await releaseChannelConnectionRuntime(ctx.store, {
      connectionId: connection.id,
      ownerId,
      leaseToken: claimed.leaseToken,
      cursor,
    });
  } catch (error) {
    if (signal.aborted) {
      await releaseChannelConnectionRuntime(ctx.store, {
        connectionId: connection.id,
        ownerId,
        leaseToken: claimed.leaseToken,
        cursor,
      });
      return;
    }
    const gatewayError = error instanceof DiscordGatewayError ? error : undefined;
    const reconnectAttempt = Math.min(connection.reconnectAttempts + 1, 8);
    const retryAfterMs =
      gatewayError?.retryAfterMs ?? Math.min(300_000, 1_000 * 2 ** reconnectAttempt);
    await failChannelConnectionRuntime(ctx.store, {
      connectionId: connection.id,
      ownerId,
      leaseToken: claimed.leaseToken,
      error: error instanceof Error ? error.message : String(error),
      cursor: gatewayError?.clearCursor ? {} : cursor,
      retryAfterMs,
    });
    throw error;
  }
}

function discordMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const frame = payload as { t?: unknown; d?: unknown };
  if (frame.t !== "MESSAGE_CREATE" || !frame.d || typeof frame.d !== "object") return null;
  const id = (frame.d as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function credential(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new DiscordGatewayError(`missing_channel_credential:${key}`, 300_000, true);
  }
  return value;
}
