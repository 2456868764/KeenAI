import { randomUUID } from "node:crypto";
import {
  CHANNEL_TYPES,
  type ChannelCapability,
  type ChannelMessageOperation,
  type ChannelType,
} from "@keenai/channels-core";
import type { ImPlatform, ParsedInboundImMessage } from "@keenai/channels-im";
import {
  type ChannelOperationLocalMutation,
  type ClaimedIngressEvent,
  admitIngressEvent,
  claimIngressEvent,
  claimOutboxDelivery,
  claimSessionCommand,
  completeIngressEvent,
  completeOutboxDelivery,
  completeOutboxOperation,
  completeSessionCommand,
  enqueueOutboxDelivery,
  enqueueOutboxOperation,
  enqueueSessionCommand,
  failIngressEvent,
  failOutboxDelivery,
  failSessionCommand,
  recordDeliveryReceipt,
  recordOutboxOperationProgress,
} from "@keenai/channels-runtime";
import {
  type MessagePart,
  type OutboundDirectives,
  inferMessageKind,
  outboundDirectivesSchema,
} from "@keenai/shared";
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
  workflowRuns,
} from "@keenai/storage/schema";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import {
  attachmentContentPath,
  createProviderAttachmentUrl,
  extractPartsFromContent,
  loadAttachmentsForMessages,
} from "./attachments.js";
import { signChannelWorkflowButton } from "./channel-action-token.js";
import { getChannelPluginRegistry } from "./channel-plugins.js";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";
import { publishConversation } from "./conversation-bus.js";
import {
  deserializeInboundEmail,
  ensureInboundEmailConversation,
  ingestInboundEmail,
  limitInboundEmailAttachments,
  serializeInboundEmail,
} from "./email-ingest.js";
import {
  type EnsuredImConversation,
  ensureInboundImConversation,
  imConversationKey,
  imConversationMetadata,
  ingestInboundIm,
} from "./im-ingest.js";
import {
  ImMutationTargetNotFoundError,
  applyInboundImMutation,
  findImMutationConversation,
} from "./im-mutations.js";
import { loadChannelCredentials } from "./slack-oauth.js";
import { readUploadFile } from "./uploads.js";
import { getInngestClient } from "./workflow-dispatch.js";
import { resumeReplyButtonsWorkflow } from "./workflow-resume.js";

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
let drainDispatchTasks: () => Promise<void> = async () => undefined;
let runSerializedDispatchTask: <T>(task: () => Promise<T>) => Promise<T> = (task) => task();

export function initChannelDispatch(ctx: AppContext): ChannelDispatch {
  runtimeContext = ctx;
  const inngest = getInngestClient();
  const localSessions = new Map<string, { again: boolean }>();
  let localTaskTail = Promise.resolve();
  const scheduleLocal = (task: () => Promise<unknown>, context: Record<string, unknown>) => {
    localTaskTail = localTaskTail.then(task).then(
      () => undefined,
      (error) => ctx.log.error({ err: error, ...context }, "channel local task failed"),
    );
  };
  dispatch = inngest
    ? {
        async dispatchIngress(eventId) {
          await inngest.send({
            name: CHANNEL_INGRESS_EVENT,
            data: { eventId },
          });
        },
        async dispatchSession(conversationId) {
          await inngest.send({
            name: CHANNEL_SESSION_EVENT,
            data: { conversationId },
          });
        },
        async dispatchDelivery(outboxId) {
          await inngest.send({
            name: CHANNEL_DELIVERY_EVENT,
            data: { outboxId },
          });
        },
      }
    : {
        async dispatchIngress(eventId) {
          scheduleLocal(() => processChannelIngress(ctx, eventId), { eventId });
        },
        async dispatchSession(conversationId) {
          const existing = localSessions.get(conversationId);
          if (existing) {
            existing.again = true;
            return;
          }
          const state = { again: false };
          localSessions.set(conversationId, state);
          scheduleLocal(
            async () => {
              try {
                do {
                  state.again = false;
                  await processChannelSession(ctx, conversationId);
                } while (state.again);
              } finally {
                localSessions.delete(conversationId);
              }
            },
            { conversationId },
          );
        },
        async dispatchDelivery(outboxId) {
          scheduleLocal(() => processChannelOutbox(ctx, outboxId), {
            outboxId,
          });
        },
      };
  drainDispatchTasks = inngest
    ? async () => undefined
    : async () => {
        let observed: Promise<void>;
        do {
          observed = localTaskTail;
          await observed;
        } while (observed !== localTaskTail);
      };
  runSerializedDispatchTask = inngest
    ? (task) => task()
    : (task) =>
        new Promise((resolve, reject) => {
          scheduleLocal(
            async () => {
              try {
                resolve(await task());
              } catch (error) {
                reject(error);
                throw error;
              }
            },
            { operation: "serialized-channel-task" },
          );
        });
  return dispatch;
}

export async function drainChannelDispatch(): Promise<void> {
  await drainDispatchTasks();
}

export function runChannelSerializedTask<T>(task: () => Promise<T>): Promise<T> {
  return runSerializedDispatchTask(task);
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
    const configured = openChannelCredentials(connection.credentials, ctx.authConfig.jwtSecret);
    const missingDefaults = Object.entries(defaults).filter(
      ([key]) =>
        configured[key] === undefined || configured[key] === null || configured[key] === "",
    );
    if (missingDefaults.length > 0) {
      const [updated] = await ctx.store.db
        .update(channelConnections)
        .set({
          credentials: sealChannelCredentials(
            { ...Object.fromEntries(missingDefaults), ...configured },
            ctx.authConfig.jwtSecret,
          ),
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, connection.id))
        .returning();
      connection = updated ?? connection;
    }
  }

  const attachmentMap = await loadAttachmentsForMessages(ctx.store.db, [message.id]);
  const attachmentRows = attachmentMap.get(message.id) ?? [];
  const parts = extractPartsFromContent(message.content) ?? [
    { type: "text" as const, text: message.plainText },
  ];
  const directives =
    explicitOutboundDirectives(message.content) ??
    workflowOutboundDirectives({
      content: message.content,
      orgId: input.orgId,
      conversationId: conversation.id,
      appUrl: ctx.env.APP_URL,
      secret: ctx.authConfig.jwtSecret,
    });
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
  const providerTarget = resolveProviderConversationTarget(conversation.channelId, link);
  const delivery = await enqueueOutboxDelivery(ctx.store, {
    deliveryId: randomUUID(),
    orgId: input.orgId,
    brandId: conversation.brandId,
    connectionId: connection.id,
    conversationId: conversation.id,
    messageId: message.id,
    channelType,
    externalThreadId: providerTarget.targetId,
    replyToProviderMessageId:
      channelType === "slack" || channelType === "feishu"
        ? (providerTarget.threadId ?? replyLink?.providerMessageId)
        : replyLink?.providerMessageId,
    parts,
    directives,
    idempotencyKey: `message:${message.id}:channel:${connection.id}`,
    metadata: {
      channelAttributes: {
        ...(conversation.attributes ?? {}),
        ...(link?.metadata ?? {}),
      },
      attachments: channelType === "email" ? emailAttachments : attachmentRefs,
      ...(channelType === "email"
        ? {
            to: conversation.userId,
            subject: conversation.subject ?? "Support",
            references: conversation.channelId ? [conversation.channelId] : [],
            ...(typeof message.metadata.emailHtml === "string"
              ? { html: message.metadata.emailHtml }
              : {}),
          }
        : {}),
    },
  });
  await ctx.store.db
    .update(messages)
    .set({
      deliveryStatus: delivery.delivery.status === "completed" ? "sent" : "pending",
    })
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
  return {
    enqueued: true as const,
    outboxId: delivery.delivery.id,
    duplicate: delivery.duplicate,
  };
}

export async function enqueueConversationMessageOperation(input: {
  orgId: string;
  conversationId: string;
  messageId: string;
  operationId: string;
  type: "edit" | "delete" | "reaction.add" | "reaction.remove";
  actorId: string;
  plainText?: string;
  emoji?: string;
}) {
  const ctx = runtimeContext;
  if (!ctx) throw new Error("channel dispatch not initialized");
  const resolved = await resolveConversationChannel(ctx, input.orgId, input.conversationId);
  if (!resolved) return { enqueued: false as const, reason: "channel_not_connected" };
  const { conversation, connection, link, channelType } = resolved;
  const [message] = await ctx.store.db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.conversationId, conversation.id),
        eq(messages.orgId, input.orgId),
      ),
    )
    .limit(1);
  if (!message) return { enqueued: false as const, reason: "message_not_found" };
  if (message.deletedAt) {
    return {
      enqueued: false as const,
      reason: input.type === "delete" ? "already_applied" : "message_deleted",
    };
  }
  if ((input.type === "edit" || input.type === "delete") && message.senderType === "user") {
    return { enqueued: false as const, reason: "message_not_owned" };
  }

  const plugin = getChannelPluginRegistry().get(channelType);
  const capability = operationCapability(input.type);
  if (!plugin.capabilities.has(capability) || !plugin.executeMessageOperation) {
    return { enqueued: false as const, reason: "operation_not_supported" };
  }
  const messageLinks = await ctx.store.db
    .select()
    .from(channelMessageLinks)
    .where(
      and(
        eq(channelMessageLinks.connectionId, connection.id),
        eq(channelMessageLinks.messageId, message.id),
        ...(input.type === "edit" || input.type === "delete"
          ? [eq(channelMessageLinks.direction, "outbound" as const)]
          : []),
      ),
    )
    .orderBy(
      asc(channelMessageLinks.actionIndex),
      asc(channelMessageLinks.createdAt),
      asc(channelMessageLinks.id),
    );
  if (messageLinks.length === 0) {
    return { enqueued: false as const, reason: "provider_message_not_found" };
  }

  const targetLinks =
    input.type === "delete"
      ? messageLinks.filter((messageLink) => isDeletableProviderResource(channelType, messageLink))
      : [
          messageLinks.find((messageLink) =>
            input.type === "edit"
              ? isEditableProviderResource(channelType, messageLink)
              : isReactionProviderResource(messageLink),
          ),
        ].filter((messageLink): messageLink is (typeof messageLinks)[number] =>
          Boolean(messageLink),
        );
  if (targetLinks.length === 0) {
    return {
      enqueued: false as const,
      reason: "provider_message_operation_target_not_found",
    };
  }

  const base = {
    orgId: input.orgId,
    brandId: conversation.brandId,
    connectionId: connection.id,
    conversationId: conversation.id,
    messageId: message.id,
    channelType,
    externalThreadId: resolveProviderConversationTarget(conversation.channelId, link).targetId,
    channelAttributes: {
      ...(conversation.attributes ?? {}),
      ...(link?.metadata ?? {}),
    },
  };
  let operations: Array<Exclude<ChannelMessageOperation, { type: "typing" }>>;
  let mutation:
    | { type: "edit"; plainText: string; content: Record<string, unknown> }
    | { type: "delete" }
    | {
        type: "reaction.add" | "reaction.remove";
        actorType: string;
        actorId: string;
        emoji: string;
      };
  if (input.type === "edit") {
    const plainText = input.plainText?.trim();
    if (!plainText) return { enqueued: false as const, reason: "plain_text_required" };
    operations = targetLinks.map((messageLink) => ({
      ...base,
      ...providerOperationTarget(messageLink),
      type: "edit" as const,
      parts: [{ type: "text" as const, text: plainText }],
    }));
    mutation = {
      type: "edit",
      plainText,
      content: { type: "text", text: plainText },
    };
  } else if (input.type === "delete") {
    operations = targetLinks.map((messageLink) => ({
      ...base,
      ...providerOperationTarget(messageLink),
      type: "delete" as const,
    }));
    mutation = { type: "delete" };
  } else {
    const emoji = input.emoji?.trim();
    if (!emoji) return { enqueued: false as const, reason: "emoji_required" };
    const reactionType = input.type as "reaction.add" | "reaction.remove";
    operations = targetLinks.map((messageLink) => ({
      ...base,
      ...providerOperationTarget(messageLink),
      type: reactionType,
      emoji,
    }));
    mutation = {
      type: reactionType,
      actorType: "agent",
      actorId: input.actorId,
      emoji,
    };
  }

  const delivery = await enqueueOutboxOperation(ctx.store, {
    deliveryId: randomUUID(),
    operations,
    mutation,
    idempotencyKey: `operation:${input.operationId}:channel:${connection.id}`,
  });
  if (!delivery.duplicate) {
    try {
      await getChannelDispatch().dispatchDelivery(delivery.delivery.id);
    } catch (error) {
      ctx.log.error(
        { err: error, outboxId: delivery.delivery.id },
        "channel operation dispatch failed; recovery will retry",
      );
    }
  }
  return {
    enqueued: true as const,
    outboxId: delivery.delivery.id,
    duplicate: delivery.duplicate,
  };
}

export async function executeConversationTyping(input: {
  orgId: string;
  conversationId: string;
}) {
  const ctx = runtimeContext;
  if (!ctx) throw new Error("channel dispatch not initialized");
  const resolved = await resolveConversationChannel(ctx, input.orgId, input.conversationId);
  if (!resolved) return { executed: false as const, reason: "channel_not_connected" };
  const { conversation, connection, link, channelType } = resolved;
  const plugin = getChannelPluginRegistry().get(channelType);
  if (!plugin.capabilities.has("typing") || !plugin.executeMessageOperation) {
    return { executed: false as const, reason: "operation_not_supported" };
  }
  const [typingTarget] =
    channelType === "whatsapp"
      ? await ctx.store.db
          .select({ providerMessageId: channelMessageLinks.providerMessageId })
          .from(channelMessageLinks)
          .where(
            and(
              eq(channelMessageLinks.connectionId, connection.id),
              eq(channelMessageLinks.conversationId, conversation.id),
              eq(channelMessageLinks.direction, "inbound"),
            ),
          )
          .orderBy(desc(channelMessageLinks.createdAt), desc(channelMessageLinks.id))
          .limit(1)
      : [];
  if (channelType === "whatsapp" && !typingTarget) {
    return { executed: false as const, reason: "provider_message_not_found" };
  }
  const credentials = await loadChannelCredentials(
    ctx.store,
    connection,
    ctx.authConfig.jwtSecret,
    ctx.env,
  );
  await plugin.executeMessageOperation(
    {
      type: "typing",
      orgId: input.orgId,
      brandId: conversation.brandId,
      connectionId: connection.id,
      conversationId: conversation.id,
      channelType,
      externalThreadId: resolveProviderConversationTarget(conversation.channelId, link).targetId,
      providerMessageId: typingTarget?.providerMessageId,
      channelAttributes: {
        ...(conversation.attributes ?? {}),
        ...(link?.metadata ?? {}),
      },
    },
    {
      connectionId: connection.id,
      orgId: connection.orgId,
      brandId: connection.brandId,
      channelType: connection.channelType,
      credentials,
      settings: connection.settings,
    },
  );
  await markConnectionHealthy(ctx, connection.id);
  return { executed: true as const };
}

function workflowOutboundDirectives(input: {
  content: unknown;
  orgId: string;
  conversationId: string;
  appUrl: string;
  secret: string;
}): OutboundDirectives | undefined {
  if (!isRecord(input.content) || input.content.type !== "workflow_reply_buttons") return undefined;
  const workflow = input.content.workflow;
  if (!isRecord(workflow) || !Array.isArray(workflow.buttons)) return undefined;
  const workflowRunId = optionalString(workflow.workflowRunId);
  const blockId = optionalString(workflow.blockId);
  if (!workflowRunId || !blockId) return undefined;
  const buttons = workflow.buttons.flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = optionalString(value.id);
    const label = optionalString(value.label);
    if (!id || !label) return [];
    const token = signChannelWorkflowButton(
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        workflowRunId,
        blockId,
        buttonId: id,
      },
      input.secret,
    );
    return [
      {
        id,
        label,
        callbackUrl: `${input.appUrl.replace(/\/$/, "")}/api/v1/webhooks/im/workflow-button?token=${encodeURIComponent(token)}`,
      },
    ];
  });
  return buttons.length > 0 ? { interaction: { buttons: buttons.slice(0, 8) } } : undefined;
}

function explicitOutboundDirectives(content: unknown): OutboundDirectives | undefined {
  if (!isRecord(content)) return undefined;
  const parsed = outboundDirectivesSchema.safeParse(content.outboundDirectives);
  return parsed.success ? parsed.data : undefined;
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
    connectionId?: string;
    provider: string;
    parsed: Parameters<typeof serializeInboundEmail>[0];
    requestHeaders?: Record<string, string>;
  },
) {
  const parsed = limitInboundEmailAttachments(input.parsed, ctx.env.UPLOAD_MAX_BYTES);
  const connection = input.connectionId
    ? { id: input.connectionId }
    : await ensureChannelConnection(
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
    providerEventId: parsed.messageId,
    eventType: "message",
    rawPayload: serializeInboundEmail(parsed),
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

type WidgetIngressPayload = {
  conversationId: string;
  externalUserId: string;
  plainText?: string;
  attachmentIds?: string[];
  parts?: MessagePart[];
};

export async function ingestWidgetMessage(
  ctx: ChannelRuntimeContext,
  input: WidgetIngressPayload & {
    orgId: string;
    brandId: string;
    clientMessageId: string;
  },
) {
  return runSerializedDispatchTask(() => ingestWidgetMessageNow(ctx, input));
}

async function ingestWidgetMessageNow(
  ctx: ChannelRuntimeContext,
  input: WidgetIngressPayload & {
    orgId: string;
    brandId: string;
    clientMessageId: string;
  },
) {
  const connection = await ensureChannelConnection(
    { store: ctx.store },
    { orgId: input.orgId, brandId: input.brandId, channelType: "widget" },
  );
  const admission = await admitIngressEvent(ctx.store, {
    orgId: input.orgId,
    brandId: input.brandId,
    connectionId: connection.id,
    channelType: "widget",
    providerEventId: input.clientMessageId,
    eventType: "message",
    rawPayload: {
      conversationId: input.conversationId,
      externalUserId: input.externalUserId,
      plainText: input.plainText,
      attachmentIds: input.attachmentIds,
      parts: input.parts,
    },
  });

  if (admission.duplicate) {
    const existingPayload = deserializeWidgetIngress(admission.event.rawPayload);
    if (!sameWidgetIngress(existingPayload, input)) {
      return {
        conflict: true as const,
        eventId: admission.event.id,
        error: "client_message_id_conflict" as const,
      };
    }
  }
  if (admission.event.status === "dead_letter") {
    return {
      failed: true as const,
      eventId: admission.event.id,
      error: admission.event.lastError ?? "widget_message_ingress_failed",
    };
  }

  if (admission.event.status === "pending" || admission.event.status === "retrying") {
    await processChannelIngress(ctx, admission.event.id, {
      dispatchSession: false,
    });
  }

  let linked = await findWidgetMessageLink(ctx, connection.id, input.clientMessageId);
  if (!linked) {
    await processChannelSession(ctx, input.conversationId);
    linked = await findWidgetMessageLink(ctx, connection.id, input.clientMessageId);
  }
  if (!linked) {
    return { pending: true as const, eventId: admission.event.id };
  }

  const [message] = await ctx.store.db
    .select()
    .from(messages)
    .where(eq(messages.id, linked.messageId))
    .limit(1);
  if (!message) throw new TerminalChannelError("widget_message_not_found");
  const { serializeMessagesWithAttachments } = await import("./conversations.js");
  const [serialized] = await serializeMessagesWithAttachments(ctx.store.db, [message]);
  if (!serialized) throw new TerminalChannelError("widget_message_serialization_failed");
  return {
    pending: false as const,
    eventId: admission.event.id,
    duplicate: admission.duplicate,
    message: serialized,
  };
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

export async function processChannelIngress(
  ctx: ChannelRuntimeContext,
  eventId: string,
  options: { dispatchSession?: boolean } = {},
) {
  const claimed = await claimIngressEvent(ctx.store, { eventId });
  if (!claimed) return { processed: false, reason: "not_claimable" };
  return processClaimedIngress(ctx, claimed, options);
}

async function processClaimedIngress(
  ctx: ChannelRuntimeContext,
  claimed: ClaimedIngressEvent,
  options: { dispatchSession?: boolean } = {},
) {
  try {
    if (claimed.event.channelType === "email") {
      return await processClaimedEmailIngress(ctx, claimed, options);
    }
    if (claimed.event.channelType === "widget") {
      return await processClaimedWidgetIngress(ctx, claimed, options);
    }
    const receiptCount = await recordIngressDeliveryReceipts(ctx, claimed.event);
    const parsed = await normalizeImPayload(ctx, claimed.event);
    if (!parsed) {
      if (receiptCount === 0) {
        throw new TerminalChannelError("unsupported_or_empty_channel_event");
      }
      await completeIngressEvent(ctx.store, {
        eventId: claimed.event.id,
        claimToken: claimed.claimToken,
      });
      await markConnectionHealthy(ctx, claimed.event.connectionId);
      return { processed: true, receipts: receiptCount };
    }
    const ensured = parsed.mutation
      ? await findImMutationConversation(ctx.store.db, {
          orgId: claimed.event.orgId,
          connectionId: claimed.event.connectionId,
          providerMessageId: parsed.mutation.targetProviderMessageId,
        }).then((conversation) => (conversation ? { conversation, created: false as const } : null))
      : parsed.interaction
        ? await existingInteractionConversation(
            ctx,
            claimed.event.connectionId,
            imConversationKey(parsed),
            parsed.replyToMessageId,
          )
        : await ensureInboundImConversation(ctx.store.db, {
            orgId: claimed.event.orgId,
            brandId: claimed.event.brandId,
            connectionId: claimed.event.connectionId,
            parsed,
          });
    if (!ensured) throw new ImMutationTargetNotFoundError();
    const now = new Date();
    if (!parsed.mutation)
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
            externalThreadId: imConversationKey(parsed),
            metadata: imConversationMetadata(parsed),
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              channelConversationLinks.connectionId,
              channelConversationLinks.externalThreadId,
            ],
            set: { metadata: imConversationMetadata(parsed), updatedAt: now },
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
    if (options.dispatchSession !== false) {
      await getChannelDispatch().dispatchSession(ensured.conversation.id);
    }
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
  options: { dispatchSession?: boolean } = {},
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
  if (options.dispatchSession !== false) {
    await getChannelDispatch().dispatchSession(ensured.conversation.id);
  }
  return { processed: true, conversationId: ensured.conversation.id };
}

async function processClaimedWidgetIngress(
  ctx: ChannelRuntimeContext,
  claimed: ClaimedIngressEvent,
  options: { dispatchSession?: boolean },
) {
  const payload = deserializeWidgetIngress(claimed.event.rawPayload);
  const [conversation] = await ctx.store.db
    .select({
      id: conversations.id,
      orgId: conversations.orgId,
      brandId: conversations.brandId,
      userId: conversations.userId,
      channelType: conversations.channelType,
    })
    .from(conversations)
    .where(eq(conversations.id, payload.conversationId))
    .limit(1);
  if (
    !conversation ||
    conversation.orgId !== claimed.event.orgId ||
    conversation.brandId !== claimed.event.brandId ||
    conversation.userId !== payload.externalUserId ||
    conversation.channelType !== "messenger"
  ) {
    throw new TerminalChannelError("widget_conversation_mismatch");
  }

  const now = new Date();
  await ctx.store.transaction(async (tx) => {
    await tx
      .insert(channelIdentities)
      .values({
        orgId: claimed.event.orgId,
        brandId: claimed.event.brandId,
        connectionId: claimed.event.connectionId,
        externalUserId: payload.externalUserId,
        profile: { source: "widget" },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [channelIdentities.connectionId, channelIdentities.externalUserId],
        set: { profile: { source: "widget" }, updatedAt: now },
      });
    await tx
      .insert(channelConversationLinks)
      .values({
        orgId: claimed.event.orgId,
        brandId: claimed.event.brandId,
        connectionId: claimed.event.connectionId,
        conversationId: conversation.id,
        externalThreadId: conversation.id,
        metadata: { source: "widget" },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [channelConversationLinks.connectionId, channelConversationLinks.externalThreadId],
        set: { metadata: { source: "widget" }, updatedAt: now },
      });
  });
  await enqueueSessionCommand(ctx.store, {
    orgId: claimed.event.orgId,
    brandId: claimed.event.brandId,
    conversationId: conversation.id,
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
  if (options.dispatchSession !== false) {
    await getChannelDispatch().dispatchSession(conversation.id);
  }
  return { processed: true, conversationId: conversation.id };
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
    if (event.channelType === "widget") {
      const payload = deserializeWidgetIngress(event.rawPayload);
      if (payload.conversationId !== conversationId) {
        throw new TerminalChannelError("widget_session_conversation_mismatch");
      }
      const existing = await findWidgetMessageLink(ctx, event.connectionId, event.providerEventId);
      let messageId = existing?.messageId;
      let plainText: string | undefined;
      if (!messageId) {
        const { insertMessage, recordConversationEvent } = await import("./conversations.js");
        const result = await insertMessage(ctx.store.db, {
          orgId: event.orgId,
          conversationId,
          senderType: "user",
          senderId: payload.externalUserId,
          plainText: payload.plainText,
          attachmentIds: payload.attachmentIds,
          parts: payload.parts,
          isInternal: false,
          sentVia: "messenger",
          isAgentReply: false,
          metadata: {
            source: "widget",
            clientMessageId: event.providerEventId,
          },
        });
        messageId = result.message.id;
        plainText = result.message.plainText;
        await ctx.store.db
          .insert(channelMessageLinks)
          .values({
            orgId: event.orgId,
            connectionId: event.connectionId,
            conversationId,
            messageId,
            providerMessageId: event.providerEventId,
            direction: "inbound",
          })
          .onConflictDoNothing({
            target: [channelMessageLinks.connectionId, channelMessageLinks.providerMessageId],
          });
        await recordConversationEvent(ctx.store.db, {
          orgId: event.orgId,
          conversationId,
          eventType: "message.created",
          actorType: "user",
          actorId: payload.externalUserId,
          payload: { messageId, clientMessageId: event.providerEventId },
        });
      } else {
        const [message] = await ctx.store.db
          .select({ plainText: messages.plainText })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);
        plainText = message?.plainText;
      }

      const { resumeCollectCustomerReplyForMessage } = await import("./workflow-resume.js");
      await resumeCollectCustomerReplyForMessage(
        ctx.store.db,
        {
          orgId: event.orgId,
          conversationId,
          messageId,
          plainText: plainText ?? "",
        },
        ctx.env,
        ctx.authConfig,
      );
      await completeSessionCommand(ctx.store, {
        commandId: claimed.command.id,
        claimToken: claimed.claimToken,
      });
      await getChannelDispatch().dispatchSession(conversationId);
      return { processed: true, messageId };
    }
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
    if (parsed.mutation) {
      const [connection] = await ctx.store.db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, event.connectionId))
        .limit(1);
      if (!connection) throw new TerminalChannelError("connection_not_found");
      const result = await applyInboundImMutation(ctx.store.db, {
        orgId: event.orgId,
        connectionId: event.connectionId,
        conversationId,
        parsed,
        env: ctx.env,
        channelCredentials: await loadChannelCredentials(
          ctx.store,
          connection,
          ctx.authConfig.jwtSecret,
          ctx.env,
        ),
      });
      await completeSessionCommand(ctx.store, {
        commandId: claimed.command.id,
        claimToken: claimed.claimToken,
      });
      await getChannelDispatch().dispatchSession(conversationId);
      return { processed: true, ...result };
    }
    if (parsed.interaction) {
      await resumeChannelInteraction(ctx, {
        orgId: event.orgId,
        connectionId: event.connectionId,
        conversationId,
        parsed,
      });
      await completeSessionCommand(ctx.store, {
        commandId: claimed.command.id,
        claimToken: claimed.claimToken,
      });
      await getChannelDispatch().dispatchSession(conversationId);
      return { processed: true, interaction: parsed.interaction };
    }
    const [connection] = await ctx.store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, event.connectionId))
      .limit(1);
    if (!connection) throw new TerminalChannelError("connection_not_found");
    const result = await ingestInboundIm(ctx.store.db, {
      orgId: event.orgId,
      brandId: event.brandId,
      parsed,
      env: ctx.env,
      channelCredentials: await loadChannelCredentials(
        ctx.store,
        connection,
        ctx.authConfig.jwtSecret,
        ctx.env,
      ),
      conversation: {
        conversation: {
          id: conversationId,
          channelId: parsed.channelId,
          subject: null,
        },
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
  let sendStarted = false;
  try {
    const payload = claimed.delivery.payload;
    const credentials = await loadChannelCredentials(
      ctx.store,
      connection,
      ctx.authConfig.jwtSecret,
      ctx.env,
    );
    const storedOperations = Array.isArray(payload.operations)
      ? payload.operations.filter(isRecord).map((operation) => operation as ChannelMessageOperation)
      : isRecord(payload.operation)
        ? [payload.operation as ChannelMessageOperation]
        : [];
    const mutation = parseOperationMutation(payload.mutation);
    if (storedOperations.length > 0) {
      if (!plugin.executeMessageOperation || !mutation) {
        throw new TerminalChannelError("channel_operation_payload_invalid");
      }
      const completedOperationCount =
        typeof payload.completedOperationCount === "number" &&
        Number.isInteger(payload.completedOperationCount) &&
        payload.completedOperationCount >= 0
          ? Math.min(payload.completedOperationCount, storedOperations.length)
          : 0;
      const operationResponses = Array.isArray(payload.operationResponses)
        ? [...payload.operationResponses]
        : [];
      for (let index = completedOperationCount; index < storedOperations.length; index += 1) {
        const storedOperation = storedOperations[index];
        if (!storedOperation) continue;
        sendStarted = true;
        const result = await plugin.executeMessageOperation(storedOperation, {
          connectionId: connection.id,
          orgId: connection.orgId,
          brandId: connection.brandId,
          channelType: connection.channelType,
          credentials,
          settings: connection.settings,
        });
        operationResponses[index] = result.providerResponse ?? null;
        const recorded = await recordOutboxOperationProgress(ctx.store, {
          outboxId: claimed.delivery.id,
          claimToken: claimed.claimToken,
          completedOperationCount: index + 1,
          operationResponses,
        });
        if (!recorded) throw new TerminalChannelError("channel_operation_claim_lost");
      }
      const completed = await completeOutboxOperation(ctx.store, {
        outboxId: claimed.delivery.id,
        claimToken: claimed.claimToken,
        mutation,
        providerResponse: operationResponses,
      });
      if (!completed) throw new TerminalChannelError("channel_operation_claim_lost");
      await publishMessageMutation(
        ctx,
        claimed.delivery.conversationId,
        claimed.delivery.messageId,
      );
      await markConnectionHealthy(ctx, connection.id);
      return { processed: true, providerMessageIds: [] };
    }
    sendStarted = true;
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
        metadata: refreshProviderAttachmentUrls(
          ctx,
          claimed.delivery.orgId,
          isRecord(payload.metadata) ? payload.metadata : undefined,
        ),
      },
      {
        connectionId: connection.id,
        orgId: connection.orgId,
        brandId: connection.brandId,
        channelType: connection.channelType,
        credentials,
        settings: connection.settings,
      },
    );
    await completeOutboxDelivery(ctx.store, {
      outboxId: claimed.delivery.id,
      claimToken: claimed.claimToken,
      providerMessageIds: result.providerMessageIds,
      providerMessageRefs: result.providerMessageRefs,
      providerResponse: result.providerResponse,
    });
    await markConnectionHealthy(ctx, connection.id);
    return { processed: true, providerMessageIds: result.providerMessageIds };
  } catch (error) {
    await failOutboxDelivery(ctx.store, {
      outboxId: claimed.delivery.id,
      claimToken: claimed.claimToken,
      error:
        error instanceof TerminalChannelError
          ? {
              disposition: "terminal",
              code: error.message,
              message: error.message,
            }
          : sendStarted
            ? plugin.classifyError(error)
            : {
                disposition: "retryable",
                code: "channel_credentials_unavailable",
                message: error instanceof Error ? error.message : String(error),
              },
      providerResponse: providerResponseFromError(error),
    });
    await markConnectionError(ctx, connection.id, error);
    throw error;
  }
}

function providerResponseFromError(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  return error.providerResponse;
}

function resolveProviderConversationTarget(
  conversationChannelId: string,
  link: { externalThreadId: string; metadata: Record<string, unknown> } | undefined,
): { targetId: string; threadId?: string } {
  return {
    targetId: optionalString(link?.metadata.providerTargetId) ?? conversationChannelId,
    threadId: optionalString(link?.metadata.providerThreadId),
  };
}

function refreshProviderAttachmentUrls(
  ctx: ChannelRuntimeContext,
  orgId: string,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || !Array.isArray(metadata.attachments)) return metadata;
  const baseUrl = (ctx.env.CHANNEL_WEBHOOK_BASE_URL ?? ctx.env.APP_URL).replace(/\/$/, "");
  return {
    ...metadata,
    attachments: metadata.attachments.map((value) => {
      if (!isRecord(value) || typeof value.attachmentId !== "string") return value;
      return {
        ...value,
        contentUrl: createProviderAttachmentUrl({
          baseUrl,
          attachmentId: value.attachmentId,
          orgId,
          secret: ctx.authConfig.jwtSecret,
        }),
      };
    }),
  };
}

async function resolveConversationChannel(
  ctx: ChannelRuntimeContext,
  orgId: string,
  conversationId: string,
) {
  const [conversation] = await ctx.store.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)))
    .limit(1);
  if (!conversation) return null;
  const channelType = normalizeChannelType(conversation.channelType);
  if (!channelType || channelType === "email") return null;
  const [link] = await ctx.store.db
    .select()
    .from(channelConversationLinks)
    .where(eq(channelConversationLinks.conversationId, conversation.id))
    .limit(1);
  if (!link) return null;
  const [connection] = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, link.connectionId),
        eq(channelConnections.orgId, orgId),
        eq(channelConnections.status, "active"),
      ),
    )
    .limit(1);
  return connection ? { conversation, channelType, link, connection } : null;
}

async function publishMessageMutation(
  ctx: ChannelRuntimeContext,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const [message] = await ctx.store.db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!message) return;
  const { serializeMessagesWithAttachments } = await import("./conversations.js");
  const [serialized] = await serializeMessagesWithAttachments(ctx.store.db, [message]);
  publishConversation({
    type: "message.updated",
    conversationId,
    message: serialized ?? message,
  });
}

function operationCapability(
  type: "edit" | "delete" | "reaction.add" | "reaction.remove",
): ChannelCapability {
  if (type === "edit") return "message_edit";
  if (type === "delete") return "message_delete";
  return "reactions";
}

type ProviderMessageLink = Pick<
  typeof channelMessageLinks.$inferSelect,
  "providerMessageId" | "providerAction" | "providerResourceType"
>;

function providerOperationTarget(messageLink: ProviderMessageLink) {
  return {
    providerMessageId: messageLink.providerMessageId,
    providerAction: messageLink.providerAction ?? undefined,
    providerResourceType: messageLink.providerResourceType,
  };
}

function isReactionProviderResource(messageLink: ProviderMessageLink): boolean {
  return messageLink.providerResourceType === "message";
}

function isDeletableProviderResource(
  channelType: ChannelType,
  messageLink: ProviderMessageLink,
): boolean {
  if (channelType !== "dingtalk") return true;
  return (
    messageLink.providerResourceType === "message" &&
    !messageLink.providerMessageId.startsWith("dingtalk:ack:")
  );
}

function isEditableProviderResource(
  channelType: ChannelType,
  messageLink: ProviderMessageLink,
): boolean {
  if (messageLink.providerResourceType !== "message") return false;
  if (!messageLink.providerAction) return true;
  if (channelType === "telegram") {
    return ["sendMessage", "sendPhoto", "sendVoice", "sendVideo", "sendDocument"].includes(
      messageLink.providerAction,
    );
  }
  if (channelType === "slack") return messageLink.providerAction === "chat.postMessage";
  if (channelType === "discord") {
    return ["createMessage", "createMessageWithFile"].includes(messageLink.providerAction);
  }
  if (channelType === "feishu") return messageLink.providerAction === "im.message.create";
  return false;
}

function parseOperationMutation(value: unknown): ChannelOperationLocalMutation | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "delete") return { type: "delete" };
  if (value.type === "edit" && typeof value.plainText === "string" && isRecord(value.content)) {
    return { type: "edit", plainText: value.plainText, content: value.content };
  }
  if (
    (value.type === "reaction.add" || value.type === "reaction.remove") &&
    typeof value.actorType === "string" &&
    typeof value.actorId === "string" &&
    typeof value.emoji === "string"
  ) {
    return {
      type: value.type,
      actorType: value.actorType,
      actorId: value.actorId,
      emoji: value.emoji,
    };
  }
  return null;
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
  input: {
    orgId: string;
    brandId: string;
    channelType: ChannelType;
    externalAccountId?: string;
  },
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
  const {
    interaction: rawInteraction,
    mediaGroupId: rawMediaGroupId,
    ...conversationAttributes
  } = attributes;
  const interaction = parseInteraction(rawInteraction);
  return {
    platformMessageId: envelope.providerMessageId,
    channelType: envelope.channelType as ImPlatform,
    conversationKey: envelope.externalThreadId,
    channelId: envelope.externalTargetId ?? envelope.externalThreadId,
    providerThreadId: envelope.threadRootProviderMessageId,
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
    mediaGroupId: typeof rawMediaGroupId === "string" ? rawMediaGroupId : undefined,
    mutation: envelope.mutation,
    interaction,
    conversationAttributes,
  };
}

async function recordIngressDeliveryReceipts(
  ctx: ChannelRuntimeContext,
  event: typeof channelIngressEvents.$inferSelect,
): Promise<number> {
  if (event.channelType === "email" || event.channelType === "widget") return 0;
  const [connection] = await ctx.store.db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, event.connectionId))
    .limit(1);
  if (!connection) throw new TerminalChannelError("connection_not_found");
  const plugin = getChannelPluginRegistry().get(event.channelType);
  if (!plugin.parseDeliveryReceipts) return 0;
  const receipts = await plugin.parseDeliveryReceipts(
    {
      headers: event.requestHeaders ?? {},
      query: {},
      rawBody: new TextEncoder().encode(JSON.stringify(event.rawPayload)),
      receivedAt: event.createdAt,
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
  for (const receipt of receipts) {
    await recordDeliveryReceipt(ctx.store, {
      orgId: event.orgId,
      connectionId: event.connectionId,
      receipt,
    });
  }
  return receipts.length;
}

function deserializeWidgetIngress(value: unknown): WidgetIngressPayload {
  if (!isRecord(value)) throw new TerminalChannelError("widget_ingress_payload_invalid");
  const conversationId = optionalString(value.conversationId);
  const externalUserId = optionalString(value.externalUserId);
  const plainText = optionalString(value.plainText);
  const attachmentIds = Array.isArray(value.attachmentIds)
    ? value.attachmentIds.filter((item): item is string => typeof item === "string")
    : undefined;
  const parts = Array.isArray(value.parts) ? (value.parts as MessagePart[]) : undefined;
  if (!conversationId || !externalUserId) {
    throw new TerminalChannelError("widget_ingress_payload_invalid");
  }
  if (!plainText?.trim() && !attachmentIds?.length && !parts?.length) {
    throw new TerminalChannelError("widget_ingress_message_empty");
  }
  return { conversationId, externalUserId, plainText, attachmentIds, parts };
}

function sameWidgetIngress(left: WidgetIngressPayload, right: WidgetIngressPayload): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.externalUserId === right.externalUserId &&
    left.plainText === right.plainText &&
    JSON.stringify(left.attachmentIds ?? []) === JSON.stringify(right.attachmentIds ?? []) &&
    JSON.stringify(left.parts ?? []) === JSON.stringify(right.parts ?? [])
  );
}

async function findWidgetMessageLink(
  ctx: ChannelRuntimeContext,
  connectionId: string,
  providerMessageId: string,
) {
  const [link] = await ctx.store.db
    .select()
    .from(channelMessageLinks)
    .where(
      and(
        eq(channelMessageLinks.connectionId, connectionId),
        eq(channelMessageLinks.providerMessageId, providerMessageId),
      ),
    )
    .limit(1);
  return link;
}

async function resumeChannelInteraction(
  ctx: ChannelRuntimeContext,
  input: {
    orgId: string;
    connectionId: string;
    conversationId: string;
    parsed: ParsedInboundImMessage;
  },
): Promise<void> {
  if (input.parsed.interaction?.type !== "button") return;

  let sourceMessage: { content: unknown } | undefined;
  if (input.parsed.replyToMessageId) {
    [sourceMessage] = await ctx.store.db
      .select({ content: messages.content })
      .from(channelMessageLinks)
      .innerJoin(messages, eq(messages.id, channelMessageLinks.messageId))
      .where(
        and(
          eq(channelMessageLinks.connectionId, input.connectionId),
          eq(channelMessageLinks.providerMessageId, input.parsed.replyToMessageId),
          eq(channelMessageLinks.conversationId, input.conversationId),
        ),
      )
      .limit(1);
  }
  if (!sourceMessage) {
    const candidates = await ctx.store.db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, input.conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(20);
    sourceMessage = candidates.find((candidate) => workflowButtonContext(candidate.content));
  }

  const context = workflowButtonContext(sourceMessage?.content);
  if (!context) return;
  if (!context.buttonIds.has(input.parsed.interaction.id)) return;
  const [run] = await ctx.store.db
    .select({ conversationId: workflowRuns.conversationId })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, context.workflowRunId), eq(workflowRuns.orgId, input.orgId)))
    .limit(1);
  if (run?.conversationId !== input.conversationId) return;
  const result = await resumeReplyButtonsWorkflow(
    ctx.store.db,
    {
      orgId: input.orgId,
      workflowRunId: context.workflowRunId,
      blockId: context.blockId,
      buttonId: input.parsed.interaction.id,
    },
    ctx.env,
    ctx.authConfig,
  );
  if (!result.resumed && result.reason !== "run_not_found") {
    ctx.log.warn(
      {
        reason: result.reason,
        conversationId: input.conversationId,
        workflowRunId: context.workflowRunId,
      },
      "channel workflow button was not resumed",
    );
  }
}

async function existingInteractionConversation(
  ctx: ChannelRuntimeContext,
  connectionId: string,
  externalThreadId: string,
  providerMessageId?: string,
): Promise<EnsuredImConversation> {
  const [linked] = await ctx.store.db
    .select({
      id: conversations.id,
      channelId: conversations.channelId,
      subject: conversations.subject,
    })
    .from(channelConversationLinks)
    .innerJoin(conversations, eq(conversations.id, channelConversationLinks.conversationId))
    .where(
      and(
        eq(channelConversationLinks.connectionId, connectionId),
        eq(channelConversationLinks.externalThreadId, externalThreadId),
      ),
    )
    .limit(1);
  if (linked) return { conversation: linked, created: false };

  const [byMessage] = providerMessageId
    ? await ctx.store.db
        .select({
          id: conversations.id,
          channelId: conversations.channelId,
          subject: conversations.subject,
        })
        .from(channelMessageLinks)
        .innerJoin(conversations, eq(conversations.id, channelMessageLinks.conversationId))
        .where(
          and(
            eq(channelMessageLinks.connectionId, connectionId),
            eq(channelMessageLinks.providerMessageId, providerMessageId),
          ),
        )
        .limit(1)
    : [];
  if (!byMessage) throw new TerminalChannelError("interaction_conversation_not_found");
  return { conversation: byMessage, created: false };
}

function workflowButtonContext(content: unknown): {
  workflowRunId: string;
  blockId: string;
  buttonIds: Set<string>;
} | null {
  if (!isRecord(content) || content.type !== "workflow_reply_buttons") return null;
  const workflow = content.workflow;
  if (!isRecord(workflow) || !Array.isArray(workflow.buttons)) return null;
  const workflowRunId = optionalString(workflow.workflowRunId);
  const blockId = optionalString(workflow.blockId);
  if (!workflowRunId || !blockId) return null;
  const buttonIds = new Set(
    workflow.buttons.flatMap((button) => {
      if (!isRecord(button)) return [];
      const id = optionalString(button.id);
      return id ? [id] : [];
    }),
  );
  return buttonIds.size > 0 ? { workflowRunId, blockId, buttonIds } : null;
}

function parseInteraction(value: unknown): ParsedInboundImMessage["interaction"] {
  if (!isRecord(value) || value.type !== "button") return undefined;
  const id = optionalString(value.id);
  return id ? { type: "button", id } : undefined;
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
