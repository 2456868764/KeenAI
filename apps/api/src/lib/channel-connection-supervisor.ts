import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { splitTelegramUpdate, telegramUpdateEventId } from "@keenai/channels-im";
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
import { listDingTalkIsvRuntimeOwners, resolveDingTalkIsvConnection } from "./dingtalk-isv.js";
import { DingTalkStreamError, runDingTalkStream } from "./dingtalk-stream.js";
import { DiscordGatewayError, runDiscordGateway } from "./discord-gateway.js";
import { FeishuWebSocketError, runFeishuWebSocket } from "./feishu-websocket.js";
import { loadChannelCredentials } from "./slack-oauth.js";
import { SlackSocketModeError, runSlackSocketMode } from "./slack-socket-mode.js";
import { TelegramPollingError, runTelegramPolling } from "./telegram-polling.js";
import { reconcileTelegramTransport } from "./telegram-webhook.js";

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
      const suiteOwners = await listDingTalkIsvRuntimeOwners(ctx.store);
      const suiteOwnerIds = new Set(suiteOwners.map((connection) => connection.id));
      const candidates = new Map(
        [
          ...connections.filter(
            (connection) =>
              connection.channelType !== "dingtalk" ||
              connection.settings.appType !== "isv" ||
              suiteOwnerIds.has(connection.id),
          ),
          ...suiteOwners,
        ].map((connection) => [connection.id, connection]),
      );
      for (const connection of candidates.values()) {
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
  return (
    (connection.channelType === "discord" && connection.transport === "gateway") ||
    (connection.channelType === "slack" && connection.transport === "stream") ||
    (connection.channelType === "feishu" && connection.transport === "stream") ||
    (connection.channelType === "dingtalk" && connection.transport === "stream") ||
    (connection.channelType === "telegram" && connection.transport === "polling")
  );
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
    const credentials = await loadChannelCredentials(
      ctx.store,
      connection,
      ctx.authConfig.jwtSecret,
      ctx.env,
    );
    if (connection.channelType === "discord" && connection.transport === "gateway") {
      const botToken = credential(credentials, "botToken");
      cursor = await runDiscordGateway({
        botToken,
        initialCursor: cursor,
        signal,
        onHeartbeat: (nextCursor, state) => {
          cursor = nextCursor;
          return runtimeHeartbeat(ctx, ownerId, claimed, nextCursor, state);
        },
        onMessage: async (payload) => {
          const messageId = discordRuntimeEventId(payload);
          if (!messageId) return;
          await admitRuntimeIngress(ctx, claimed, "discord", messageId, payload);
        },
      });
    } else if (connection.channelType === "slack" && connection.transport === "stream") {
      const appToken = credential(credentials, "appToken", SlackSocketModeError);
      cursor = await runSlackSocketMode({
        appToken,
        signal,
        onHeartbeat: (state) => runtimeHeartbeat(ctx, ownerId, claimed, cursor, state),
        onEnvelope: async (payload) => {
          const eventId = slackRuntimeEventId(payload);
          if (!eventId) return;
          await admitRuntimeIngress(ctx, claimed, "slack", eventId, payload);
        },
      });
    } else if (connection.channelType === "feishu" && connection.transport === "stream") {
      cursor = {};
      await runFeishuWebSocket({
        appId: credential(credentials, "appId", FeishuWebSocketError),
        appSecret: credential(credentials, "appSecret", FeishuWebSocketError),
        signal,
        onHeartbeat: (state) => runtimeHeartbeat(ctx, ownerId, claimed, cursor, state),
        onEnvelope: async (payload) => {
          const eventId = feishuMessageEventId(payload);
          if (!eventId) return;
          await admitRuntimeIngress(ctx, claimed, "feishu", eventId, payload);
        },
      });
    } else if (connection.channelType === "dingtalk" && connection.transport === "stream") {
      cursor = {};
      await runDingTalkStream({
        clientId: credential(credentials, "appKey", DingTalkStreamError),
        clientSecret: credential(credentials, "appSecret", DingTalkStreamError),
        signal,
        onHeartbeat: (state) => runtimeHeartbeat(ctx, ownerId, claimed, cursor, state),
        onEnvelope: async (payload) => {
          const eventId = dingtalkMessageEventId(payload);
          if (!eventId) return;
          const routed = await resolveDingTalkRuntimeConnection(ctx, claimed, payload);
          await admitRuntimeIngress(ctx, routed, "dingtalk", eventId, payload);
        },
      });
    } else if (connection.channelType === "telegram" && connection.transport === "polling") {
      const botToken = credential(credentials, "botToken", TelegramPollingError);
      try {
        await reconcileTelegramTransport({ botToken, transport: "polling" });
      } catch (error) {
        throw new TelegramPollingError(
          error instanceof Error ? error.message : "telegram_polling_setup_failed",
          60_000,
        );
      }
      cursor = await runTelegramPolling({
        botToken,
        initialCursor: cursor,
        signal,
        onHeartbeat: (nextCursor, state) => {
          cursor = nextCursor;
          return runtimeHeartbeat(ctx, ownerId, claimed, nextCursor, state);
        },
        onUpdate: async (payload) => {
          for (const update of splitTelegramUpdate(payload)) {
            const eventId = telegramUpdateEventId(update);
            if (!eventId) continue;
            await admitRuntimeIngress(ctx, claimed, "telegram", eventId, update);
          }
        },
      });
    } else {
      throw new DiscordGatewayError("unsupported_channel_connection_runtime", 300_000);
    }
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
    const gatewayError =
      error instanceof DiscordGatewayError ||
      error instanceof SlackSocketModeError ||
      error instanceof FeishuWebSocketError ||
      error instanceof DingTalkStreamError ||
      error instanceof TelegramPollingError
        ? error
        : undefined;
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

async function resolveDingTalkRuntimeConnection(
  ctx: AppContext,
  claimed: ClaimedChannelConnectionRuntime,
  payload: Record<string, unknown>,
): Promise<ClaimedChannelConnectionRuntime> {
  if (claimed.connection.settings.appType !== "isv") return claimed;
  const corpId = setting(payload, "chatbotCorpId");
  const suiteKey = setting(claimed.connection.settings, "suiteKey");
  if (!corpId || !suiteKey) {
    throw new DingTalkStreamError("dingtalk_isv_tenant_identity_missing", 60_000);
  }
  try {
    const connection = await resolveDingTalkIsvConnection({
      store: ctx.store,
      suiteKey,
      corpId,
    });
    return { ...claimed, connection };
  } catch (error) {
    throw new DingTalkStreamError(
      error instanceof Error ? error.message : "channel_not_configured",
      60_000,
    );
  }
}

function runtimeHeartbeat(
  ctx: AppContext,
  ownerId: string,
  claimed: ClaimedChannelConnectionRuntime,
  cursor: Record<string, unknown>,
  state: "connected" | "reconnecting",
) {
  return heartbeatChannelConnectionRuntime(ctx.store, {
    connectionId: claimed.connection.id,
    ownerId,
    leaseToken: claimed.leaseToken,
    cursor,
    state,
  });
}

async function admitRuntimeIngress(
  ctx: AppContext,
  claimed: ClaimedChannelConnectionRuntime,
  channelType: "discord" | "slack" | "feishu" | "dingtalk" | "telegram",
  providerEventId: string,
  payload: unknown,
) {
  const admission = await admitIngressEvent(ctx.store, {
    orgId: claimed.connection.orgId,
    brandId: claimed.connection.brandId,
    connectionId: claimed.connection.id,
    channelType,
    providerEventId,
    eventType: "message",
    rawPayload: payload,
  });
  if (!admission.duplicate) await getChannelDispatch().dispatchIngress(admission.event.id);
}

export function discordRuntimeEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const frame = payload as { t?: unknown; s?: unknown; d?: unknown };
  const supported = new Set([
    "MESSAGE_CREATE",
    "MESSAGE_UPDATE",
    "MESSAGE_DELETE",
    "MESSAGE_REACTION_ADD",
    "MESSAGE_REACTION_REMOVE",
    "INTERACTION_CREATE",
  ]);
  if (
    typeof frame.t !== "string" ||
    !supported.has(frame.t) ||
    !frame.d ||
    typeof frame.d !== "object"
  )
    return null;
  const data = frame.d as { id?: unknown; message_id?: unknown };
  const target =
    typeof data.id === "string"
      ? data.id
      : typeof data.message_id === "string"
        ? data.message_id
        : null;
  const sequence = typeof frame.s === "number" && Number.isSafeInteger(frame.s) ? frame.s : null;
  return target && (sequence !== null || frame.t === "INTERACTION_CREATE")
    ? `discord:${frame.t}:${sequence ?? target}`
    : null;
}

export function slackRuntimeEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const frame = payload as {
    event_id?: unknown;
    event?: unknown;
    type?: unknown;
    trigger_id?: unknown;
  };
  if (frame.type === "block_actions") {
    return typeof frame.trigger_id === "string" ? frame.trigger_id : null;
  }
  if (!frame.event || typeof frame.event !== "object") return null;
  const event = frame.event as { type?: unknown; bot_id?: unknown };
  if (!new Set(["message", "reaction_added", "reaction_removed"]).has(String(event.type))) {
    return null;
  }
  if (event.type === "message" && typeof event.bot_id === "string") return null;
  return typeof frame.event_id === "string" && frame.event_id.length > 0 ? frame.event_id : null;
}

function feishuMessageEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const header = (payload as { header?: unknown }).header;
  if (!header || typeof header !== "object") return null;
  const eventId = (header as { event_id?: unknown }).event_id;
  return typeof eventId === "string" && eventId.length > 0 ? eventId : null;
}

function dingtalkMessageEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const messageId = (payload as { msgId?: unknown }).msgId;
  return typeof messageId === "string" && messageId.length > 0 ? messageId : null;
}

function credential(
  credentials: Record<string, unknown>,
  key: string,
  ErrorType:
    | typeof DiscordGatewayError
    | typeof SlackSocketModeError
    | typeof FeishuWebSocketError
    | typeof DingTalkStreamError
    | typeof TelegramPollingError = DiscordGatewayError,
): string {
  const value = credentials[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ErrorType(`missing_channel_credential:${key}`, 300_000, true);
  }
  return value;
}

function setting(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}
