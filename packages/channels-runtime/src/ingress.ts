import type { ChannelType } from "@keenai/channels-core";
import type { Store } from "@keenai/storage";
import { channelDeadLetters, channelIngressEvents } from "@keenai/storage/schema";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { createClaim, retryAt } from "./queue-helpers.js";

export type AdmitIngressEventInput = {
  orgId: string;
  brandId: string;
  connectionId: string;
  channelType: ChannelType;
  providerEventId: string;
  eventType: string;
  rawPayload: unknown;
  requestHeaders?: Record<string, string>;
  receivedAt?: Date;
};

export type ClaimedIngressEvent = {
  event: typeof channelIngressEvents.$inferSelect;
  claimToken: string;
};

export async function admitIngressEvent(store: Store, input: AdmitIngressEventInput) {
  const now = input.receivedAt ?? new Date();
  const [inserted] = await store.db
    .insert(channelIngressEvents)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      connectionId: input.connectionId,
      channelType: input.channelType,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      rawPayload: input.rawPayload,
      requestHeaders: input.requestHeaders ?? {},
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [channelIngressEvents.connectionId, channelIngressEvents.providerEventId],
    })
    .returning();

  if (inserted) return { event: inserted, duplicate: false as const };

  const [existing] = await store.db
    .select()
    .from(channelIngressEvents)
    .where(
      and(
        eq(channelIngressEvents.connectionId, input.connectionId),
        eq(channelIngressEvents.providerEventId, input.providerEventId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("channel_ingress_dedupe_lookup_failed");
  return { event: existing, duplicate: true as const };
}

export async function claimIngressEvent(
  store: Store,
  options: { eventId?: string; now?: Date; leaseMs?: number } = {},
): Promise<ClaimedIngressEvent | null> {
  const now = options.now ?? new Date();
  return store.transaction(async (tx) => {
    const statusClaimable = or(
      and(
        or(eq(channelIngressEvents.status, "pending"), eq(channelIngressEvents.status, "retrying")),
        lte(channelIngressEvents.availableAt, now),
      ),
      and(
        eq(channelIngressEvents.status, "processing"),
        or(
          isNull(channelIngressEvents.leaseExpiresAt),
          lte(channelIngressEvents.leaseExpiresAt, now),
        ),
      ),
    );
    const claimable = options.eventId
      ? and(eq(channelIngressEvents.id, options.eventId), statusClaimable)
      : statusClaimable;
    const [candidate] = await tx
      .select()
      .from(channelIngressEvents)
      .where(claimable)
      .orderBy(asc(channelIngressEvents.availableAt), asc(channelIngressEvents.createdAt))
      .limit(1);
    if (!candidate) return null;

    const claim = createClaim(now, options.leaseMs);
    const [event] = await tx
      .update(channelIngressEvents)
      .set({
        status: "processing",
        attempts: candidate.attempts + 1,
        ...claim,
        updatedAt: now,
      })
      .where(and(eq(channelIngressEvents.id, candidate.id), claimable))
      .returning();
    return event ? { event, claimToken: claim.claimToken } : null;
  });
}

export async function completeIngressEvent(
  store: Store,
  input: { eventId: string; claimToken: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await store.db
    .update(channelIngressEvents)
    .set({
      status: "completed",
      processedAt: now,
      claimToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(channelIngressEvents.id, input.eventId),
        eq(channelIngressEvents.status, "processing"),
        eq(channelIngressEvents.claimToken, input.claimToken),
      ),
    )
    .returning({ id: channelIngressEvents.id });
  return rows.length === 1;
}

export async function failIngressEvent(
  store: Store,
  input: {
    eventId: string;
    claimToken: string;
    errorCode: string;
    errorMessage: string;
    retryable: boolean;
    maxAttempts?: number;
    retryAfterMs?: number;
    now?: Date;
  },
): Promise<"retrying" | "dead_letter" | "stale_claim"> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(channelIngressEvents)
      .where(
        and(
          eq(channelIngressEvents.id, input.eventId),
          eq(channelIngressEvents.status, "processing"),
          eq(channelIngressEvents.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!event) return "stale_claim";

    const shouldRetry = input.retryable && event.attempts < (input.maxAttempts ?? 8);
    const status = shouldRetry ? "retrying" : "dead_letter";
    await tx
      .update(channelIngressEvents)
      .set({
        status,
        availableAt: shouldRetry
          ? retryAt(event.attempts, now, input.retryAfterMs)
          : event.availableAt,
        claimToken: null,
        leaseExpiresAt: null,
        lastErrorCode: input.errorCode,
        lastError: input.errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(channelIngressEvents.id, event.id),
          eq(channelIngressEvents.claimToken, input.claimToken),
        ),
      );

    if (!shouldRetry) {
      await tx
        .insert(channelDeadLetters)
        .values({
          orgId: event.orgId,
          sourceType: "ingress",
          sourceId: event.id,
          reasonCode: input.errorCode,
          reason: input.errorMessage,
          payload: event.rawPayload,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [channelDeadLetters.sourceType, channelDeadLetters.sourceId],
          set: {
            reasonCode: input.errorCode,
            reason: input.errorMessage,
            payload: event.rawPayload,
            resolvedAt: null,
            updatedAt: now,
          },
        });
    }
    return status;
  });
}
