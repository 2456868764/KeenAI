import type {
  ChannelClassifiedError,
  ChannelDeliveryReceipt,
  ChannelMessageOperation,
  ChannelOutboundEnvelope,
  ChannelProviderMessageRef,
} from "@keenai/channels-core";
import type { Store } from "@keenai/storage";
import {
  channelDeadLetters,
  channelDeliveryAttempts,
  channelDeliveryReceipts,
  channelMessageLinks,
  channelOutbox,
  messages,
  reactions,
} from "@keenai/storage/schema";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { createClaim, retryAt } from "./queue-helpers.js";

export type EnqueueOutboxDeliveryInput = ChannelOutboundEnvelope & {
  idempotencyKey: string;
  availableAt?: Date;
  maxAttempts?: number;
};

export type ClaimedOutboxDelivery = {
  delivery: typeof channelOutbox.$inferSelect;
  claimToken: string;
};

export type ChannelOperationLocalMutation =
  | {
      type: "edit";
      plainText: string;
      content: Record<string, unknown>;
    }
  | { type: "delete" }
  | {
      type: "reaction.add" | "reaction.remove";
      actorType: string;
      actorId: string;
      emoji: string;
    };

export type EnqueueOutboxOperationInput = {
  deliveryId: string;
  operations?: Array<Exclude<ChannelMessageOperation, { type: "typing" }>>;
  /** Backward-compatible single-target input; new callers should use operations. */
  operation?: Exclude<ChannelMessageOperation, { type: "typing" }>;
  mutation: ChannelOperationLocalMutation;
  idempotencyKey: string;
  availableAt?: Date;
  maxAttempts?: number;
};

export type FailOutboxDeliveryInput = {
  outboxId: string;
  claimToken: string;
  error: ChannelClassifiedError;
  providerStatus?: number;
  providerResponse?: unknown;
  now?: Date;
};

export async function enqueueOutboxDelivery(store: Store, input: EnqueueOutboxDeliveryInput) {
  const now = new Date();
  const [inserted] = await store.db
    .insert(channelOutbox)
    .values({
      id: input.deliveryId,
      orgId: input.orgId,
      brandId: input.brandId,
      connectionId: input.connectionId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      channelType: input.channelType,
      externalThreadId: input.externalThreadId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        replyToProviderMessageId: input.replyToProviderMessageId,
        parts: input.parts,
        directives: input.directives,
        metadata: input.metadata,
      },
      maxAttempts: input.maxAttempts ?? 8,
      availableAt: input.availableAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: channelOutbox.idempotencyKey })
    .returning();
  if (inserted) return { delivery: inserted, duplicate: false as const };

  const [existing] = await store.db
    .select()
    .from(channelOutbox)
    .where(eq(channelOutbox.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) throw new Error("channel_outbox_dedupe_lookup_failed");
  return { delivery: existing, duplicate: true as const };
}

export async function enqueueOutboxOperation(store: Store, input: EnqueueOutboxOperationInput) {
  const operations = input.operations ?? (input.operation ? [input.operation] : []);
  const operation = operations[0];
  if (!operation) throw new Error("channel_operation_target_required");
  const messageId = operation.messageId;
  if (!messageId) throw new Error("channel_operation_message_id_required");
  const now = new Date();
  const [inserted] = await store.db
    .insert(channelOutbox)
    .values({
      id: input.deliveryId,
      orgId: operation.orgId,
      brandId: operation.brandId,
      connectionId: operation.connectionId,
      conversationId: operation.conversationId,
      messageId,
      channelType: operation.channelType,
      externalThreadId: operation.externalThreadId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        operations,
        completedOperationCount: 0,
        operationResponses: [],
        mutation: input.mutation,
      },
      maxAttempts: input.maxAttempts ?? 8,
      availableAt: input.availableAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: channelOutbox.idempotencyKey })
    .returning();
  if (inserted) return { delivery: inserted, duplicate: false as const };

  const [existing] = await store.db
    .select()
    .from(channelOutbox)
    .where(eq(channelOutbox.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) throw new Error("channel_outbox_dedupe_lookup_failed");
  return { delivery: existing, duplicate: true as const };
}

export async function claimOutboxDelivery(
  store: Store,
  options: { outboxId?: string; now?: Date; leaseMs?: number } = {},
): Promise<ClaimedOutboxDelivery | null> {
  const now = options.now ?? new Date();
  return store.transaction(async (tx) => {
    const claimable = or(
      and(
        or(eq(channelOutbox.status, "pending"), eq(channelOutbox.status, "retrying")),
        lte(channelOutbox.availableAt, now),
      ),
      and(
        eq(channelOutbox.status, "processing"),
        or(isNull(channelOutbox.leaseExpiresAt), lte(channelOutbox.leaseExpiresAt, now)),
      ),
    );
    const selectedClaimable = options.outboxId
      ? and(eq(channelOutbox.id, options.outboxId), claimable)
      : claimable;
    const [candidate] = await tx
      .select()
      .from(channelOutbox)
      .where(selectedClaimable)
      .orderBy(asc(channelOutbox.availableAt), asc(channelOutbox.createdAt))
      .limit(1);
    if (!candidate) return null;

    const claim = createClaim(now, options.leaseMs);
    const [delivery] = await tx
      .update(channelOutbox)
      .set({
        status: "processing",
        attempts: candidate.attempts + 1,
        ...claim,
        updatedAt: now,
      })
      .where(and(eq(channelOutbox.id, candidate.id), selectedClaimable))
      .returning();
    if (!delivery) return null;

    await tx.insert(channelDeliveryAttempts).values({
      outboxId: delivery.id,
      attempt: delivery.attempts,
      startedAt: now,
      createdAt: now,
    });
    return { delivery, claimToken: claim.claimToken };
  });
}

export async function completeOutboxDelivery(
  store: Store,
  input: {
    outboxId: string;
    claimToken: string;
    providerMessageIds: string[];
    providerMessageRefs?: ChannelProviderMessageRef[];
    providerResponse?: unknown;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(channelOutbox)
      .where(
        and(
          eq(channelOutbox.id, input.outboxId),
          eq(channelOutbox.status, "processing"),
          eq(channelOutbox.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!delivery) return false;

    await tx
      .update(channelOutbox)
      .set({
        status: "completed",
        acceptedAt: now,
        completedAt: now,
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(channelOutbox.id, delivery.id), eq(channelOutbox.claimToken, input.claimToken)),
      );
    await tx
      .update(messages)
      .set({ deliveryStatus: "sent" })
      .where(eq(messages.id, delivery.messageId));
    await tx
      .update(channelDeliveryAttempts)
      .set({
        completedAt: now,
        disposition: "completed",
        providerResponse: input.providerResponse,
      })
      .where(
        and(
          eq(channelDeliveryAttempts.outboxId, delivery.id),
          eq(channelDeliveryAttempts.attempt, delivery.attempts),
        ),
      );
    const providerMessageRefs =
      input.providerMessageRefs?.length === input.providerMessageIds.length
        ? input.providerMessageRefs
        : input.providerMessageIds.map((providerMessageId, actionIndex) => ({
            providerMessageId,
            resourceType: "message" as const,
            actionIndex,
          }));
    for (const providerMessageRef of providerMessageRefs) {
      const { providerMessageId } = providerMessageRef;
      await tx
        .insert(channelMessageLinks)
        .values({
          orgId: delivery.orgId,
          connectionId: delivery.connectionId,
          conversationId: delivery.conversationId,
          messageId: delivery.messageId,
          providerMessageId,
          providerAction:
            "providerAction" in providerMessageRef ? providerMessageRef.providerAction : undefined,
          providerResourceType: providerMessageRef.resourceType,
          actionIndex: providerMessageRef.actionIndex,
          direction: "outbound",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [channelMessageLinks.connectionId, channelMessageLinks.providerMessageId],
        });
      await tx
        .insert(channelDeliveryReceipts)
        .values({
          orgId: delivery.orgId,
          connectionId: delivery.connectionId,
          outboxId: delivery.id,
          providerMessageId,
          status: "accepted",
          occurredAt: now,
          payload: input.providerResponse,
          createdAt: now,
        })
        .onConflictDoNothing();
    }
    return true;
  });
}

export async function recordOutboxOperationProgress(
  store: Store,
  input: {
    outboxId: string;
    claimToken: string;
    completedOperationCount: number;
    operationResponses: unknown[];
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(channelOutbox)
      .where(
        and(
          eq(channelOutbox.id, input.outboxId),
          eq(channelOutbox.status, "processing"),
          eq(channelOutbox.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!delivery) return false;
    const currentCount =
      typeof delivery.payload.completedOperationCount === "number"
        ? delivery.payload.completedOperationCount
        : 0;
    if (input.completedOperationCount < currentCount) return false;
    const updated = await tx
      .update(channelOutbox)
      .set({
        payload: {
          ...delivery.payload,
          completedOperationCount: input.completedOperationCount,
          operationResponses: input.operationResponses,
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(channelOutbox.id, delivery.id),
          eq(channelOutbox.status, "processing"),
          eq(channelOutbox.claimToken, input.claimToken),
        ),
      )
      .returning({ id: channelOutbox.id });
    return updated.length === 1;
  });
}

export async function completeOutboxOperation(
  store: Store,
  input: {
    outboxId: string;
    claimToken: string;
    mutation: ChannelOperationLocalMutation;
    providerResponse?: unknown;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(channelOutbox)
      .where(
        and(
          eq(channelOutbox.id, input.outboxId),
          eq(channelOutbox.status, "processing"),
          eq(channelOutbox.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!delivery) return false;

    const completed = await tx
      .update(channelOutbox)
      .set({
        status: "completed",
        acceptedAt: now,
        completedAt: now,
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(and(eq(channelOutbox.id, delivery.id), eq(channelOutbox.claimToken, input.claimToken)))
      .returning({ id: channelOutbox.id });
    if (completed.length !== 1) return false;

    await tx
      .update(channelDeliveryAttempts)
      .set({
        completedAt: now,
        disposition: "completed",
        providerResponse: input.providerResponse,
      })
      .where(
        and(
          eq(channelDeliveryAttempts.outboxId, delivery.id),
          eq(channelDeliveryAttempts.attempt, delivery.attempts),
        ),
      );

    if (input.mutation.type === "edit") {
      await tx
        .update(messages)
        .set({
          plainText: input.mutation.plainText,
          content: input.mutation.content,
          editedAt: now,
        })
        .where(eq(messages.id, delivery.messageId));
    } else if (input.mutation.type === "delete") {
      await tx.update(messages).set({ deletedAt: now }).where(eq(messages.id, delivery.messageId));
    } else if (input.mutation.type === "reaction.add") {
      await tx
        .insert(reactions)
        .values({
          messageId: delivery.messageId,
          actorType: input.mutation.actorType,
          actorId: input.mutation.actorId,
          emoji: input.mutation.emoji,
          createdAt: now,
        })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(reactions)
        .where(
          and(
            eq(reactions.messageId, delivery.messageId),
            eq(reactions.actorType, input.mutation.actorType),
            eq(reactions.actorId, input.mutation.actorId),
            eq(reactions.emoji, input.mutation.emoji),
          ),
        );
    }
    return true;
  });
}

export async function failOutboxDelivery(
  store: Store,
  input: FailOutboxDeliveryInput,
): Promise<"retrying" | "dead_letter" | "stale_claim"> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(channelOutbox)
      .where(
        and(
          eq(channelOutbox.id, input.outboxId),
          eq(channelOutbox.status, "processing"),
          eq(channelOutbox.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!delivery) return "stale_claim";

    const shouldRetry =
      (input.error.disposition === "retryable" || input.error.disposition === "rate_limited") &&
      delivery.attempts < delivery.maxAttempts;
    const status = shouldRetry ? "retrying" : "dead_letter";
    const nextAttemptAt = shouldRetry
      ? retryAt(delivery.attempts, now, input.error.retryAfterMs)
      : undefined;

    await tx
      .update(channelOutbox)
      .set({
        status,
        availableAt: nextAttemptAt ?? delivery.availableAt,
        claimToken: null,
        leaseExpiresAt: null,
        lastErrorCode: input.error.code,
        lastError: input.error.message,
        updatedAt: now,
      })
      .where(
        and(eq(channelOutbox.id, delivery.id), eq(channelOutbox.claimToken, input.claimToken)),
      );
    if (!isOperationPayload(delivery.payload)) {
      await tx
        .update(messages)
        .set({ deliveryStatus: shouldRetry ? "pending" : "failed" })
        .where(eq(messages.id, delivery.messageId));
    }
    await tx
      .update(channelDeliveryAttempts)
      .set({
        completedAt: now,
        disposition: input.error.disposition,
        providerStatus: input.providerStatus,
        providerResponse: input.providerResponse,
        errorCode: input.error.code,
        errorMessage: input.error.message,
        nextAttemptAt,
      })
      .where(
        and(
          eq(channelDeliveryAttempts.outboxId, delivery.id),
          eq(channelDeliveryAttempts.attempt, delivery.attempts),
        ),
      );
    if (!shouldRetry) {
      await tx
        .insert(channelDeadLetters)
        .values({
          orgId: delivery.orgId,
          sourceType: "delivery",
          sourceId: delivery.id,
          reasonCode: input.error.code,
          reason: input.error.message,
          payload: delivery.payload,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [channelDeadLetters.sourceType, channelDeadLetters.sourceId],
          set: {
            reasonCode: input.error.code,
            reason: input.error.message,
            payload: delivery.payload,
            resolvedAt: null,
            updatedAt: now,
          },
        });
    }
    return status;
  });
}

function isOperationPayload(payload: Record<string, unknown>): boolean {
  return (
    (Boolean(payload.operation) && typeof payload.operation === "object") ||
    Array.isArray(payload.operations)
  );
}

export async function recordDeliveryReceipt(
  store: Store,
  input: {
    orgId: string;
    connectionId: string;
    receipt: ChannelDeliveryReceipt;
  },
): Promise<boolean> {
  const [messageLink] = await store.db
    .select()
    .from(channelMessageLinks)
    .where(
      and(
        eq(channelMessageLinks.connectionId, input.connectionId),
        eq(channelMessageLinks.providerMessageId, input.receipt.providerMessageId),
      ),
    )
    .limit(1);
  const [outbox] = messageLink
    ? await store.db
        .select({ id: channelOutbox.id })
        .from(channelOutbox)
        .where(eq(channelOutbox.messageId, messageLink.messageId))
        .limit(1)
    : [];
  const rows = await store.db
    .insert(channelDeliveryReceipts)
    .values({
      orgId: input.orgId,
      connectionId: input.connectionId,
      outboxId: outbox?.id,
      providerMessageId: input.receipt.providerMessageId,
      status: input.receipt.status,
      occurredAt: input.receipt.occurredAt,
      payload: input.receipt.payload,
      errorCode: input.receipt.errorCode,
      errorMessage: input.receipt.errorMessage,
    })
    .onConflictDoNothing()
    .returning({ id: channelDeliveryReceipts.id });
  if (rows.length === 1 && messageLink) {
    const currentStatuses = deliveryStatusesThatMayAdvanceTo(input.receipt.status);
    await store.db
      .update(messages)
      .set({ deliveryStatus: input.receipt.status })
      .where(
        and(
          eq(messages.id, messageLink.messageId),
          or(isNull(messages.deliveryStatus), inArray(messages.deliveryStatus, currentStatuses)),
        ),
      );
  }
  return rows.length === 1;
}

function deliveryStatusesThatMayAdvanceTo(next: ChannelDeliveryReceipt["status"]): string[] {
  if (next === "accepted") return ["pending", "accepted"];
  if (next === "sent") return ["pending", "accepted", "sent"];
  if (next === "delivered") {
    return ["pending", "accepted", "sent", "failed", "delivered"];
  }
  if (next === "read") {
    return ["pending", "accepted", "sent", "failed", "delivered", "read"];
  }
  return ["pending", "accepted", "sent", "failed"];
}
