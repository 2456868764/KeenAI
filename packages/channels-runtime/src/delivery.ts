import type {
  ChannelClassifiedError,
  ChannelDeliveryReceipt,
  ChannelOutboundEnvelope,
} from "@keenai/channels-core";
import type { Store } from "@keenai/storage";
import {
  channelDeadLetters,
  channelDeliveryAttempts,
  channelDeliveryReceipts,
  channelMessageLinks,
  channelOutbox,
  messages,
} from "@keenai/storage/schema";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
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
    for (const providerMessageId of input.providerMessageIds) {
      await tx
        .insert(channelMessageLinks)
        .values({
          orgId: delivery.orgId,
          connectionId: delivery.connectionId,
          conversationId: delivery.conversationId,
          messageId: delivery.messageId,
          providerMessageId,
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
    await tx
      .update(messages)
      .set({ deliveryStatus: shouldRetry ? "pending" : "failed" })
      .where(eq(messages.id, delivery.messageId));
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
    await store.db
      .update(messages)
      .set({ deliveryStatus: input.receipt.status === "failed" ? "failed" : input.receipt.status })
      .where(eq(messages.id, messageLink.messageId));
  }
  return rows.length === 1;
}
