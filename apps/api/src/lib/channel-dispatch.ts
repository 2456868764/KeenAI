import { randomUUID } from "node:crypto";
import { CHANNEL_TYPES, type ChannelType } from "@keenai/channels-core";
import type { ImPlatform, ParsedInboundImMessage } from "@keenai/channels-im";
import {
  type ClaimedIngressEvent,
  admitIngressEvent,
  claimIngressEvent,
  claimOutboxDelivery,
  claimSessionCommand,
  completeIngressEvent,
  completeOutboxDelivery,
  completeSessionCommand,
  enqueueOutboxDelivery,
  enqueueSessionCommand,
  failIngressEvent,
  failOutboxDelivery,
  failSessionCommand,
} from "@keenai/channels-runtime";
import { inferMessageKind } from "@keenai/shared";
import {
  channelConnections,
  channelConversationLinks,
  channelIdentities,
  channelIngressEvents,
  channelMessageLinks,
  channelOutbox,
  channelSessionCommands,
  conversations,
  messages,
} from "@keenai/storage/schema";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import {
  attachmentContentPath,
  extractPartsFromContent,
  loadAttachmentsForMessages,
} from "./attachments.js";
import { getChannelPluginRegistry } from "./channel-plugins.js";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";
import {
  deserializeInboundEmail,
  ensureInboundEmailConversation,
  ingestInboundEmail,
  serializeInboundEmail,
} from "./email-ingest.js";
import { ensureInboundImConversation, ingestInboundIm } from "./im-ingest.js";
import { readUploadFile } from "./uploads.js";
import { getInngestClient } from "./workflow-dispatch.js";

const CHANNEL_INGRESS_EVENT = "keenai/channel.ingress";
const CHANNEL_SESSION_EVENT = "keenai/channel.session";
const CHANNEL_DELIVERY_EVENT = "keenai/channel.delivery";

type ChannelDispatch = {
  dispatchIngress(eventId: string): Promise<void>;
  dispatchSession(conversationId: string): Promise<void>;
  dispatchDelivery(outboxId: string): Promise<void>;
};

type ChannelRuntimeContext = Pick<AppContext, "store" | "env" | "log" | "authConfig">;

let dispatch: ChannelDispatch | null = null;
let runtimeContext: AppContext | null = null;

export function initChannelDispatch(ctx: AppContext): ChannelDispatch {
  runtimeContext = ctx;
  const inngest = getInngestClient();
  dispatch = inngest
    ? {
        async dispatchIngress(eventId) {
          await inngest.send({ name: CHANNEL_INGRESS_EVENT, data: { eventId } });
        },
        async dispatchSession(conversationId) {
          await inngest.send({ name: CHANNEL_SESSION_EVENT, data: { conversationId } });
        },
        async dispatchDelivery(outboxId) {
          await inngest.send({ name: CHANNEL_DELIVERY_EVENT, data: { outboxId } });
        },
      }
    : {
        async dispatchIngress(eventId) {
          queueMicrotask(() => {
            void processChannelIngress(ctx, eventId).catch((error) =>
              ctx.log.error({ err: error, eventId }, "channel ingress processing failed"),
            );
          });
        },
        async dispatchSession(conversationId) {
          queueMicrotask(() => {
            void processChannelSession(ctx, conversationId).catch((error) =>
              ctx.log.error({ err: error, conversationId }, "channel session processing failed"),
            );
          });
        },
        async dispatchDelivery(outboxId) {
          queueMicrotask(() => {
            void processChannelOutbox(ctx, outboxId).catch((error) =>
              ctx.log.error({ err: error, outboxId }, "channel delivery processing failed"),
            );
          });
        },
      };
  return dispatch;
}

export async function enqueueMessageForChannelDelivery(input: {
  orgId: string;
  conversationId: string;
  messageId: string;
}) {
  const ctx = runtimeContext;
  if (!ctx) throw new Error("channel dispatch not initialized");

  const [conversation] = await ctx.store.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);
  const [message] = await ctx.store.db
    .select()
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId)))
    .limit(1);
  if (!conversation || !message || message.isInternal || message.senderType === "user") {
    return { enqueued: false as const, reason: "not_deliverable" };
  }
  const channelType = normalizeChannelType(conversation.channelType);
  if (!channelType) {
    return { enqueued: false as const, reason: "unsupported_channel" };
  }

  const [link] = await ctx.store.db
    .select()
    .from(channelConversationLinks)
    .where(eq(channelConversationLinks.conversationId, conversation.id))
    .limit(1);
  let [connection] = link
    ? await ctx.store.db
        .select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.id, link.connectionId),
            eq(channelConnections.status, "active"),
          ),
        )
        .limit(1)
    : await ctx.store.db
        .select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.orgId, input.orgId),
            eq(channelConnections.brandId, conversation.brandId),
            eq(channelConnections.channelType, channelType),
            eq(channelConnections.status, "active"),
          ),
        )
        .limit(1);

  if (!connection && link) {
    return { enqueued: false as const, reason: "connection_not_active" };
  }
  if (!connection) {
    if (ctx.env.NODE_ENV === "test") {
      return { enqueued: false as const, reason: "connection_not_found" };
    }
    connection = await ensureChannelConnection(
      { store: ctx.store },
      {
        orgId: input.orgId,
        brandId: conversation.brandId,
        channelType,
      },
    );
  }

  const defaults = defaultConnectionCredentials(ctx, channelType);
  if (Object.keys(defaults).length > 0) {
    const mergedCredentials = {
      ...defaults,
      ...openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret),
    };
    const [updated] = await ctx.store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(mergedCredentials, ctx.authConfig.jwtSecret),
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, connection.id))
      .returning();
    connection = updated ?? connection;
  }

  const attachmentMap = await loadAttachmentsForMessages(ctx.store.db, [message.id]);
  const attachmentRows = attachmentMap.get(message.id) ?? [];
  const parts = extractPartsFromContent(message.content) ?? [
    { type: "text" as const, text: message.plainText },
  ];
  const publicBaseUrl = ctx.env.APP_URL.replace(/\/$/, "");
  const attachmentRefs = attachmentRows.map((row) => ({
    attachmentId: row.id,
    contentUrl: `${publicBaseUrl}${attachmentContentPath(row.id)}`,
    contentType: row.contentType ?? "application/octet-stream",
    fileName: row.fileName ?? "attachment",
  }));
  const emailAttachments: Array<{
    fileName: string;
    contentType?: string;
    contentBase64: string;
  }> = [];
  if (channelType === "email") {
    for (const row of attachmentRows) {
      const bytes = await readUploadFile(ctx.env, row.storageKey);
      if (!bytes) continue;
      emailAttachments.push({
        fileName: row.fileName ?? "attachment",
        contentType: row.contentType ?? undefined,
        contentBase64: Buffer.from(bytes).toString("base64"),
      });
    }
  }

  const [replyLink] = message.inReplyTo
    ? await ctx.store.db
        .select()
        .from(channelMessageLinks)
        .where(
          and(
            eq(channelMessageLinks.connectionId, connection.id),
            eq(channelMessageLinks.messageId, message.inReplyTo),
          ),
        )
        .limit(1)
    : [];
  const delivery = await enqueueOutboxDelivery(ctx.store, {
    deliveryId: randomUUID(),
    orgId: input.orgId,
    brandId: conversation.brandId,
    connectionId: connection.id,
    conversationId: conversation.id,
    messageId: message.id,
    channelType,
    externalThreadId: link?.externalThreadId ?? conversation.channelId,
    replyToProviderMessageId: replyLink?.providerMessageId,
    parts,
    idempotencyKey: `message:${message.id}:channel:${connection.id}`,
    metadata: {
      channelAttributes: conversation.attributes ?? {},
      attachments: channelType === "email" ? emailAttachments : attachmentRefs,
      ...(channelType === "email"
        ? {
            to: conversation.userId,
            subject: conversation.subject ?? "Support",
            references: conversation.channelId ? [conversation.channelId] : [],
          }
        : {}),
    },
  });
  await ctx.store.db
    .update(messages)
    .set({ deliveryStatus: delivery.delivery.status === "completed" ? "sent" : "pending" })
    .where(eq(messages.id, message.id));
  if (!delivery.duplicate) {
    try {
      await getChannelDispatch().dispatchDelivery(delivery.delivery.id);
    } catch (error) {
      ctx.log.error(
        { err: error, outboxId: delivery.delivery.id },
        "channel delivery dispatch failed; recovery will retry",
      );
    }
  }
  return { enqueued: true as const, outboxId: delivery.delivery.id, duplicate: delivery.duplicate };
}

export function getChannelDispatch(): ChannelDispatch {
  if (!dispatch) throw new Error("channel dispatch not initialized");
  return dispatch;
}

export async function admitEmailIngress(
  ctx: ChannelRuntimeContext,
  input: {
    orgId: string;
    brandId: string;
    provider: string;
    parsed: Parameters<typeof serializeInboundEmail>[0];
    requestHeaders?: Record<string, string>;
  },
) {
  const connection = await ensureChannelConnection(
    { store: ctx.store },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      channelType: "email",
      externalAccountId: input.provider,
    },
  );
  const admission = await admitIngressEvent(ctx.store, {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: connection.id,
    channelType: "email",
    providerEventId: input.parsed.messageId,
    eventType: "message",
    rawPayload: serializeInboundEmail(input.parsed),
    requestHeaders: input.requestHeaders,
  });
  if (!admission.duplicate) {
    try {
      await getChannelDispatch().dispatchIngress(admission.event.id);
    } catch (error) {
      ctx.log.error(
        { err: error, ingressEventId: admission.event.id },
        "email ingress dispatch failed; recovery will retry",
      );
    }
  }
  return admission;
}

export function createChannelInngestFunctions(client: Inngest, ctx: AppContext) {
  return [
    client.createFunction(
      { id: "keenai-channel-ingress", retries: 3, concurrency: { limit: 25 } },
      { event: CHANNEL_INGRESS_EVENT },
      async ({ event, step }) =>
        step.run("process-channel-ingress", () =>
          processChannelIngress(ctx, String((event.data as { eventId: string }).eventId)),
        ),
    ),
    client.createFunction(
      { id: "keenai-channel-delivery", retries: 3, concurrency: { limit: 25 } },
      { event: CHANNEL_DELIVERY_EVENT },
      async ({ event, step }) =>
        step.run("process-channel-delivery", () =>
          processChannelOutbox(ctx, String((event.data as { outboxId: string }).outboxId)),
        ),
    ),
    client.createFunction(
      {
        id: "keenai-channel-session",
        retries: 3,
        concurrency: { limit: 1, key: "event.data.conversationId" },
      },
      { event: CHANNEL_SESSION_EVENT },
      async ({ event, step }) =>
        step.run("process-channel-session", () =>
          processChannelSession(
            ctx,
            String((event.data as { conversationId: string }).conversationId),
          ),
        ),
    ),
    client.createFunction(
      { id: "keenai-channel-recovery", retries: 2, concurrency: { limit: 1 } },
      { cron: "*/1 * * * *" },
      async ({ step }) => step.run("recover-channel-queues", () => recoverChannelQueues(ctx, 50)),
    ),
  ] as const;
}

export async function processChannelIngress(ctx: ChannelRuntimeContext, eventId: string) {
  const claimed = await claimIngressEvent(ctx.store, { eventId });
  if (!claimed) return { processed: false, reason: "not_claimable" };
  return processClaimedIngress(ctx, claimed);
}

async function processClaimedIngress(ctx: ChannelRuntimeContext, claimed: ClaimedIngressEvent) {
  try {
    if (claimed.event.channelType === "email") {
      return await processClaimedEmailIngress(ctx, claimed);
    }
    const parsed = await normalizeImPayload(ctx, claimed.event);
    if (!parsed) throw new TerminalChannelError("unsupported_or_empty_channel_event");
    const ensured = await ensureInboundImConversation(ctx.store.db, {
      orgId: claimed.event.orgId,
      brandId: claimed.event.brandId,
      connectionId: claimed.event.connectionId,
      parsed,
    });
    const now = new Date();
    await ctx.store.transaction(async (tx) => {
      await tx
        .insert(channelIdentities)
        .values({
          orgId: claimed.event.orgId,
          brandId: claimed.event.brandId,
          connectionId: claimed.event.connectionId,
          externalUserId: parsed.userId,
          displayName:
            typeof parsed.conversationAttributes?.profileName === "string"
              ? parsed.conversationAttributes.profileName
              : undefined,
          profile: parsed.conversationAttributes ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [channelIdentities.connectionId, channelIdentities.externalUserId],
          set: {
            profile: parsed.conversationAttributes ?? {},
            updatedAt: now,
          },
        });
      await tx
        .insert(channelConversationLinks)
        .values({
          orgId: claimed.event.orgId,
          brandId: claimed.event.brandId,
          connectionId: claimed.event.connectionId,
          conversationId: ensured.conversation.id,
          externalThreadId: parsed.channelId,
          metadata: parsed.conversationAttributes ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            channelConversationLinks.connectionId,
            channelConversationLinks.externalThreadId,
          ],
          set: { metadata: parsed.conversationAttributes ?? {}, updatedAt: now },
        });
    });
    await enqueueSessionCommand(ctx.store, {
      orgId: claimed.event.orgId,
      brandId: claimed.event.brandId,
      conversationId: ensured.conversation.id,
      ingressEventId: claimed.event.id,
      commandType: "message",
      idempotencyKey: `ingress:${claimed.event.id}`,
      payload: { ingressEventId: claimed.event.id },
    });
    await completeIngressEvent(ctx.store, {
      eventId: claimed.event.id,
      claimToken: claimed.claimToken,
    });
    await markConnectionHealthy(ctx, claimed.event.connectionId);
    await getChannelDispatch().dispatchSession(ensured.conversation.id);
    return { processed: true, conversationId: ensured.conversation.id };
  } catch (error) {
    const terminal = error instanceof TerminalChannelError;
    await failIngressEvent(ctx.store, {
      eventId: claimed.event.id,
      claimToken: claimed.claimToken,
      errorCode: terminal ? "invalid_event" : "ingress_processing_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      retryable: !terminal,
    });
    await markConnectionError(ctx, claimed.event.connectionId, error);
    throw error;
  }
}

async function processClaimedEmailIngress(
  ctx: ChannelRuntimeContext,
  claimed: ClaimedIngressEvent,
) {
  const parsed = deserializeInboundEmail(claimed.event.rawPayload);
  const ensured = await ensureInboundEmailConversation(ctx.store.db, {
    orgId: claimed.event.orgId,
    brandId: claimed.event.brandId,
    parsed,
  });
  const now = new Date();
  await ctx.store.transaction(async (tx) => {
    await tx
      .insert(channelIdentities)
      .values({
        orgId: claimed.event.orgId,
        brandId: claimed.event.brandId,
        connectionId: claimed.event.connectionId,
        externalUserId: parsed.from.address,
        displayName: parsed.from.name,
        profile: { email: parsed.from.address, name: parsed.from.name },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [channelIdentities.connectionId, channelIdentities.externalUserId],
        set: {
          displayName: parsed.from.name,
          profile: { email: parsed.from.address, name: parsed.from.name },
          updatedAt: now,
        },
      });
    await tx
      .insert(channelConversationLinks)
      .values({
        orgId: claimed.event.orgId,
        brandId: claimed.event.brandId,
        connectionId: claimed.event.connectionId,
        conversationId: ensured.conversation.id,
        externalThreadId: ensured.conversation.channelId,
        metadata: { subject: parsed.subject },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [channelConversationLinks.connectionId, channelConversationLinks.externalThreadId],
        set: { metadata: { subject: parsed.subject }, updatedAt: now },
      });
  });
  await enqueueSessionCommand(ctx.store, {
    orgId: claimed.event.orgId,
    brandId: claimed.event.brandId,
    conversationId: ensured.conversation.id,
    ingressEventId: claimed.event.id,
    commandType: "message",
    idempotencyKey: `ingress:${claimed.event.id}`,
    payload: { ingressEventId: claimed.event.id },
  });
  await completeIngressEvent(ctx.store, {
    eventId: claimed.event.id,
    claimToken: claimed.claimToken,
  });
  await markConnectionHealthy(ctx, claimed.event.connectionId);
  await getChannelDispatch().dispatchSession(ensured.conversation.id);
  return { processed: true, conversationId: ensured.conversation.id };
}

export async function processChannelSession(ctx: ChannelRuntimeContext, conversationId: string) {
  const claimed = await claimSessionCommand(ctx.store, { conversationId });
  if (!claimed) return { processed: false, reason: "not_claimable" };
  try {
    const ingressEventId = claimed.command.ingressEventId;
    if (!ingressEventId) throw new TerminalChannelError("session_command_missing_ingress_event");
    const [event] = await ctx.store.db
      .select()
      .from(channelIngressEvents)
      .where(eq(channelIngressEvents.id, ingressEventId))
      .limit(1);
    if (!event) throw new TerminalChannelError("ingress_event_not_found");
    if (event.channelType === "email") {
      const parsed = deserializeInboundEmail(event.rawPayload);
      const [conversation] = await ctx.store.db
        .select({
          id: conversations.id,
          channelId: conversations.channelId,
          subject: conversations.subject,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!conversation) throw new TerminalChannelError("conversation_not_found");
      const result = await ingestInboundEmail(ctx.store.db, {
        orgId: event.orgId,
        brandId: event.brandId,
        parsed,
        env: ctx.env,
        conversation: {
          conversation,
          created: false,
          matchReason: "in-reply-to",
        },
      });
      await ctx.store.db
        .insert(channelMessageLinks)
        .values({
          orgId: event.orgId,
          connectionId: event.connectionId,
          conversationId,
          messageId: result.messageId,
          providerMessageId: parsed.messageId,
          direction: "inbound",
        })
        .onConflictDoNothing({
          target: [channelMessageLinks.connectionId, channelMessageLinks.providerMessageId],
        });
      await completeSessionCommand(ctx.store, {
        commandId: claimed.command.id,
        claimToken: claimed.claimToken,
      });
      await getChannelDispatch().dispatchSession(conversationId);
      return { processed: true, messageId: result.messageId };
    }
    const parsed = await normalizeImPayload(ctx, event);
    if (!parsed) throw new TerminalChannelError("unsupported_or_empty_channel_event");
    const [connection] = await ctx.store.db
      .select({ credentials: channelConnections.credentials })
      .from(channelConnections)
      .where(eq(channelConnections.id, event.connectionId))
      .limit(1);
    if (!connection) throw new TerminalChannelError("connection_not_found");
    const result = await ingestInboundIm(ctx.store.db, {
      orgId: event.orgId,
      brandId: event.brandId,
      parsed,
      env: ctx.env,
      channelCredentials: openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret),
      conversation: {
        conversation: { id: conversationId, channelId: parsed.channelId, subject: null },
        created: false,
      },
    });
    await ctx.store.db
      .insert(channelMessageLinks)
      .values({
        orgId: event.orgId,
        connectionId: event.connectionId,
        conversationId,
        messageId: result.messageId,
        providerMessageId: parsed.platformMessageId,
        direction: "inbound",
      })
      .onConflictDoNothing({
        target: [channelMessageLinks.connectionId, channelMessageLinks.providerMessageId],
      });
    await completeSessionCommand(ctx.store, {
      commandId: claimed.command.id,
      claimToken: claimed.claimToken,
    });
    await getChannelDispatch().dispatchSession(conversationId);
    return { processed: true, messageId: result.messageId };
  } catch (error) {
    const terminal = error instanceof TerminalChannelError;
    await failSessionCommand(ctx.store, {
      commandId: claimed.command.id,
      claimToken: claimed.claimToken,
      errorMessage: error instanceof Error ? error.message : String(error),
      retryable: !terminal,
    });
    throw error;
  }
}

export async function processChannelOutbox(ctx: ChannelRuntimeContext, outboxId?: string) {
  const claimed = await claimOutboxDelivery(ctx.store, { outboxId });
  if (!claimed) return { processed: false, reason: "not_claimable" };
  const [connection] = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, claimed.delivery.connectionId))
    .limit(1);
  if (!connection) {
    await failOutboxDelivery(ctx.store, {
      outboxId: claimed.delivery.id,
      claimToken: claimed.claimToken,
      error: {
        disposition: "terminal",
        code: "connection_not_found",
        message: "Channel connection not found",
      },
    });
    return { processed: false, reason: "connection_not_found" };
  }
  const plugin = getChannelPluginRegistry().get(claimed.delivery.channelType);
  try {
    const payload = claimed.delivery.payload;
    const result = await plugin.send(
      {
        deliveryId: claimed.delivery.id,
        orgId: claimed.delivery.orgId,
        brandId: claimed.delivery.brandId,
        connectionId: claimed.delivery.connectionId,
        conversationId: claimed.delivery.conversationId,
        messageId: claimed.delivery.messageId,
        channelType: claimed.delivery.channelType,
        externalThreadId: claimed.delivery.externalThreadId,
        replyToProviderMessageId: optionalString(payload.replyToProviderMessageId),
        parts: Array.isArray(payload.parts) ? (payload.parts as never[]) : [],
        directives: isRecord(payload.directives) ? payload.directives : undefined,
        metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
      },
      {
        connectionId: connection.id,
        orgId: connection.orgId,
        brandId: connection.brandId,
        channelType: connection.channelType,
        credentials: openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret),
        settings: connection.settings,
      },
    );
    await completeOutboxDelivery(ctx.store, {
      outboxId: claimed.delivery.id,
      claimToken: claimed.claimToken,
      providerMessageIds: result.providerMessageIds,
      providerResponse: result.providerResponse,
    });
    await markConnectionHealthy(ctx, connection.id);
    return { processed: true, providerMessageIds: result.providerMessageIds };
  } catch (error) {
    await failOutboxDelivery(ctx.store, {
      outboxId: claimed.delivery.id,
      claimToken: claimed.claimToken,
      error: plugin.classifyError(error),
    });
    await markConnectionError(ctx, connection.id, error);
    throw error;
  }
}

async function markConnectionHealthy(ctx: ChannelRuntimeContext, connectionId: string) {
  const now = new Date();
  await ctx.store.db
    .update(channelConnections)
    .set({ lastConnectedAt: now, lastError: null, updatedAt: now })
    .where(eq(channelConnections.id, connectionId));
}

async function markConnectionError(
  ctx: ChannelRuntimeContext,
  connectionId: string,
  error: unknown,
) {
  await ctx.store.db
    .update(channelConnections)
    .set({
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    })
    .where(eq(channelConnections.id, connectionId));
}

export async function recoverChannelQueues(ctx: ChannelRuntimeContext, limit: number) {
  let ingress = 0;
  let delivery = 0;
  let deliveryIntents = 0;
  for (let index = 0; index < limit; index++) {
    const claimed = await claimIngressEvent(ctx.store);
    if (!claimed) break;
    try {
      await processClaimedIngress(ctx, claimed);
      ingress += 1;
    } catch (error) {
      ctx.log.error(
        { err: error, ingressEventId: claimed.event.id },
        "channel ingress recovery item failed",
      );
    }
  }

  const now = new Date();
  const sessions = await ctx.store.db
    .select({ conversationId: channelSessionCommands.conversationId })
    .from(channelSessionCommands)
    .where(
      and(
        inArray(channelSessionCommands.status, ["pending", "retrying"]),
        lte(channelSessionCommands.availableAt, now),
      ),
    )
    .orderBy(asc(channelSessionCommands.availableAt))
    .limit(limit);
  for (const session of new Set(sessions.map((row) => row.conversationId))) {
    try {
      await processChannelSession(ctx, session);
    } catch (error) {
      ctx.log.error(
        { err: error, conversationId: session },
        "channel session recovery item failed",
      );
    }
  }

  const pendingMessages = await ctx.store.db
    .select({
      orgId: messages.orgId,
      conversationId: messages.conversationId,
      messageId: messages.id,
    })
    .from(messages)
    .where(
      and(
        eq(messages.deliveryStatus, "pending"),
        eq(messages.isInternal, false),
        inArray(messages.senderType, ["agent", "ai"]),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(limit);
  for (const message of pendingMessages) {
    try {
      const result = await enqueueMessageForChannelDelivery(message);
      if (result.enqueued) deliveryIntents += 1;
    } catch (error) {
      ctx.log.error(
        { err: error, messageId: message.messageId },
        "channel delivery intent recovery failed",
      );
    }
  }

  for (let index = 0; index < limit; index++) {
    try {
      const result = await processChannelOutbox(ctx);
      if (!result.processed) break;
      delivery += 1;
    } catch (error) {
      ctx.log.error({ err: error }, "channel delivery recovery item failed");
    }
  }
  return { ingress, sessions: sessions.length, deliveryIntents, delivery };
}

export async function ensureChannelConnection(
  ctx: Pick<AppContext, "store">,
  input: { orgId: string; brandId: string; channelType: ChannelType; externalAccountId?: string },
) {
  const externalAccountId = input.externalAccountId ?? "default";
  const [inserted] = await ctx.store.db
    .insert(channelConnections)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      channelType: input.channelType,
      name: channelDisplayName(input.channelType),
      externalAccountId,
    })
    .onConflictDoNothing({
      target: [
        channelConnections.orgId,
        channelConnections.brandId,
        channelConnections.channelType,
        channelConnections.externalAccountId,
      ],
    })
    .returning();
  if (inserted) return inserted;
  const [existing] = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, input.orgId),
        eq(channelConnections.brandId, input.brandId),
        eq(channelConnections.channelType, input.channelType),
        eq(channelConnections.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("channel_connection_create_failed");
  return existing;
}

async function normalizeImPayload(
  ctx: ChannelRuntimeContext,
  event: typeof channelIngressEvents.$inferSelect,
): Promise<ParsedInboundImMessage | null> {
  if (event.channelType === "email" || event.channelType === "widget") return null;
  const [connection] = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, event.connectionId))
    .limit(1);
  if (!connection) throw new TerminalChannelError("connection_not_found");
  const plugin = getChannelPluginRegistry().get(event.channelType);
  if (!plugin.normalizeInbound) throw new TerminalChannelError("channel_normalizer_not_available");
  const envelope = await plugin.normalizeInbound(
    {
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.rawPayload,
    },
    {
      connectionId: connection.id,
      orgId: connection.orgId,
      brandId: connection.brandId,
      channelType: connection.channelType,
      credentials: openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret),
      settings: connection.settings,
    },
  );
  if (!envelope) return null;
  const attributes = envelope.attributes ?? {};
  return {
    platformMessageId: envelope.providerMessageId,
    channelType: envelope.channelType as ImPlatform,
    channelId: envelope.externalThreadId,
    userId: envelope.externalUserId,
    plainText: envelope.plainText,
    parts: envelope.parts,
    messageKind: inferMessageKind(envelope.parts),
    attachments: envelope.attachments
      .map((attachment, index) => ({
        fileName: attachment.fileName ?? `attachment-${index + 1}`,
        contentType: attachment.contentType ?? "application/octet-stream",
        sizeBytes: attachment.sizeBytes ?? 0,
        platform: envelope.channelType as ImPlatform,
        platformRef: attachment.url ?? attachment.providerAttachmentId ?? "",
      }))
      .filter((attachment) => attachment.platformRef.length > 0),
    replyToMessageId: envelope.replyToProviderMessageId,
    mediaGroupId: typeof attributes.mediaGroupId === "string" ? attributes.mediaGroupId : undefined,
    conversationAttributes: attributes,
  };
}

function channelDisplayName(platform: ChannelType): string {
  if (platform === "wecom") return "WeCom";
  if (platform === "whatsapp") return "WhatsApp";
  if (platform === "dingtalk") return "DingTalk";
  if (platform === "feishu") return "Feishu";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function isChannelType(value: string): value is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(value);
}

function normalizeChannelType(value: string): ChannelType | null {
  if (value === "messenger") return "widget";
  return isChannelType(value) ? value : null;
}

function defaultConnectionCredentials(
  ctx: ChannelRuntimeContext,
  channelType: ChannelType,
): Record<string, unknown> {
  if (channelType === "telegram" && ctx.env.TELEGRAM_BOT_TOKEN) {
    return { botToken: ctx.env.TELEGRAM_BOT_TOKEN };
  }
  if (channelType === "slack" && ctx.env.SLACK_BOT_TOKEN) {
    return { botToken: ctx.env.SLACK_BOT_TOKEN };
  }
  if (channelType === "whatsapp" && ctx.env.WHATSAPP_ACCESS_TOKEN) {
    return {
      accessToken: ctx.env.WHATSAPP_ACCESS_TOKEN,
      graphApiVersion: ctx.env.WHATSAPP_GRAPH_API_VERSION,
    };
  }
  if (channelType === "email" && ctx.authConfig.smtp) {
    return { ...ctx.authConfig.smtp };
  }
  return {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

class TerminalChannelError extends Error {}
