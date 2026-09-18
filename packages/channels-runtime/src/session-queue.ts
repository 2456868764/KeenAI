import type { Store } from "@keenai/storage";
import {
  type ChannelSessionCommandType,
  channelDeadLetters,
  channelSessionCommands,
} from "@keenai/storage/schema";
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { createClaim, retryAt } from "./queue-helpers.js";

export type EnqueueSessionCommandInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  ingressEventId?: string;
  commandType: ChannelSessionCommandType;
  idempotencyKey: string;
  priority?: number;
  payload: Record<string, unknown>;
  availableAt?: Date;
};

export type ClaimedSessionCommand = {
  command: typeof channelSessionCommands.$inferSelect;
  claimToken: string;
};

export async function enqueueSessionCommand(store: Store, input: EnqueueSessionCommandInput) {
  return store.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(channelSessionCommands)
      .where(eq(channelSessionCommands.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return { command: existing, duplicate: true as const };

    const [latest] = await tx
      .select({ sequence: channelSessionCommands.sequence })
      .from(channelSessionCommands)
      .where(eq(channelSessionCommands.conversationId, input.conversationId))
      .orderBy(desc(channelSessionCommands.sequence))
      .limit(1);
    const now = new Date();
    const [command] = await tx
      .insert(channelSessionCommands)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
        ingressEventId: input.ingressEventId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        sequence: (latest?.sequence ?? 0) + 1,
        priority: input.priority ?? 0,
        payload: input.payload,
        availableAt: input.availableAt ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: channelSessionCommands.idempotencyKey })
      .returning();
    if (command) return { command, duplicate: false as const };

    const [raced] = await tx
      .select()
      .from(channelSessionCommands)
      .where(eq(channelSessionCommands.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!raced) throw new Error("channel_session_command_enqueue_failed");
    return { command: raced, duplicate: true as const };
  });
}

export async function claimSessionCommand(
  store: Store,
  input: { conversationId: string; now?: Date; leaseMs?: number },
): Promise<ClaimedSessionCommand | null> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: channelSessionCommands.id })
      .from(channelSessionCommands)
      .where(
        and(
          eq(channelSessionCommands.conversationId, input.conversationId),
          eq(channelSessionCommands.status, "processing"),
          gt(channelSessionCommands.leaseExpiresAt, now),
        ),
      )
      .limit(1);
    if (active) return null;

    const claimable = and(
      eq(channelSessionCommands.conversationId, input.conversationId),
      or(
        and(
          or(
            eq(channelSessionCommands.status, "pending"),
            eq(channelSessionCommands.status, "retrying"),
          ),
          lte(channelSessionCommands.availableAt, now),
        ),
        and(
          eq(channelSessionCommands.status, "processing"),
          or(
            isNull(channelSessionCommands.leaseExpiresAt),
            lte(channelSessionCommands.leaseExpiresAt, now),
          ),
        ),
      ),
    );
    const [candidate] = await tx
      .select()
      .from(channelSessionCommands)
      .where(claimable)
      .orderBy(
        desc(channelSessionCommands.priority),
        asc(channelSessionCommands.sequence),
        asc(channelSessionCommands.createdAt),
      )
      .limit(1);
    if (!candidate) return null;

    const claim = createClaim(now, input.leaseMs);
    const [command] = await tx
      .update(channelSessionCommands)
      .set({
        status: "processing",
        attempts: candidate.attempts + 1,
        ...claim,
        updatedAt: now,
      })
      .where(and(eq(channelSessionCommands.id, candidate.id), claimable))
      .returning();
    return command ? { command, claimToken: claim.claimToken } : null;
  });
}

export async function completeSessionCommand(
  store: Store,
  input: { commandId: string; claimToken: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await store.db
    .update(channelSessionCommands)
    .set({
      status: "completed",
      completedAt: now,
      claimToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(channelSessionCommands.id, input.commandId),
        eq(channelSessionCommands.status, "processing"),
        eq(channelSessionCommands.claimToken, input.claimToken),
      ),
    )
    .returning({ id: channelSessionCommands.id });
  return rows.length === 1;
}

export async function failSessionCommand(
  store: Store,
  input: {
    commandId: string;
    claimToken: string;
    errorMessage: string;
    retryable: boolean;
    maxAttempts?: number;
    retryAfterMs?: number;
    now?: Date;
  },
): Promise<"retrying" | "dead_letter" | "stale_claim"> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [command] = await tx
      .select()
      .from(channelSessionCommands)
      .where(
        and(
          eq(channelSessionCommands.id, input.commandId),
          eq(channelSessionCommands.status, "processing"),
          eq(channelSessionCommands.claimToken, input.claimToken),
        ),
      )
      .limit(1);
    if (!command) return "stale_claim";

    const shouldRetry = input.retryable && command.attempts < (input.maxAttempts ?? 5);
    const status = shouldRetry ? "retrying" : "dead_letter";
    await tx
      .update(channelSessionCommands)
      .set({
        status,
        availableAt: shouldRetry
          ? retryAt(command.attempts, now, input.retryAfterMs)
          : command.availableAt,
        claimToken: null,
        leaseExpiresAt: null,
        lastError: input.errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(channelSessionCommands.id, command.id),
          eq(channelSessionCommands.claimToken, input.claimToken),
        ),
      );
    if (!shouldRetry) {
      await tx
        .insert(channelDeadLetters)
        .values({
          orgId: command.orgId,
          sourceType: "session",
          sourceId: command.id,
          reasonCode: "session_command_failed",
          reason: input.errorMessage,
          payload: command.payload,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [channelDeadLetters.sourceType, channelDeadLetters.sourceId],
          set: { reason: input.errorMessage, payload: command.payload, updatedAt: now },
        });
    }
    return status;
  });
}
