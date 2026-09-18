import type { Store } from "@keenai/storage";
import {
  channelDeadLetters,
  channelIngressEvents,
  channelOutbox,
  channelSessionCommands,
  messages,
} from "@keenai/storage/schema";
import { and, eq, sql } from "drizzle-orm";

export type ChannelDeadLetterReplayTarget =
  | { sourceType: "ingress"; sourceId: string }
  | { sourceType: "session"; sourceId: string; conversationId: string }
  | { sourceType: "delivery"; sourceId: string };

export async function replayChannelDeadLetter(
  store: Store,
  input: { orgId: string; deadLetterId: string; now?: Date },
): Promise<ChannelDeadLetterReplayTarget | null> {
  const now = input.now ?? new Date();
  return store.transaction(async (tx) => {
    const [deadLetter] = await tx
      .select()
      .from(channelDeadLetters)
      .where(
        and(
          eq(channelDeadLetters.id, input.deadLetterId),
          eq(channelDeadLetters.orgId, input.orgId),
        ),
      )
      .limit(1);
    if (!deadLetter) return null;

    let target: ChannelDeadLetterReplayTarget;
    if (deadLetter.sourceType === "ingress") {
      const rows = await tx
        .update(channelIngressEvents)
        .set({
          status: "retrying",
          attempts: 0,
          availableAt: now,
          claimedAt: null,
          claimToken: null,
          leaseExpiresAt: null,
          processedAt: null,
          lastErrorCode: null,
          lastError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(channelIngressEvents.id, deadLetter.sourceId),
            eq(channelIngressEvents.orgId, input.orgId),
          ),
        )
        .returning({ id: channelIngressEvents.id });
      if (rows.length === 0) throw new Error("channel_dead_letter_source_not_found");
      target = { sourceType: "ingress", sourceId: deadLetter.sourceId };
    } else if (deadLetter.sourceType === "session") {
      const [command] = await tx
        .update(channelSessionCommands)
        .set({
          status: "retrying",
          attempts: 0,
          availableAt: now,
          claimedAt: null,
          claimToken: null,
          leaseExpiresAt: null,
          completedAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(channelSessionCommands.id, deadLetter.sourceId),
            eq(channelSessionCommands.orgId, input.orgId),
          ),
        )
        .returning({
          id: channelSessionCommands.id,
          conversationId: channelSessionCommands.conversationId,
        });
      if (!command) throw new Error("channel_dead_letter_source_not_found");
      target = {
        sourceType: "session",
        sourceId: command.id,
        conversationId: command.conversationId,
      };
    } else {
      const [delivery] = await tx
        .update(channelOutbox)
        .set({
          status: "retrying",
          maxAttempts: sql`${channelOutbox.maxAttempts} + 8`,
          availableAt: now,
          claimedAt: null,
          claimToken: null,
          leaseExpiresAt: null,
          acceptedAt: null,
          completedAt: null,
          lastErrorCode: null,
          lastError: null,
          updatedAt: now,
        })
        .where(and(eq(channelOutbox.id, deadLetter.sourceId), eq(channelOutbox.orgId, input.orgId)))
        .returning({ id: channelOutbox.id, messageId: channelOutbox.messageId });
      if (!delivery) throw new Error("channel_dead_letter_source_not_found");
      await tx
        .update(messages)
        .set({ deliveryStatus: "pending" })
        .where(eq(messages.id, delivery.messageId));
      target = { sourceType: "delivery", sourceId: delivery.id };
    }

    await tx
      .update(channelDeadLetters)
      .set({
        replayCount: deadLetter.replayCount + 1,
        lastReplayedAt: now,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(channelDeadLetters.id, deadLetter.id));
    return target;
  });
}

export async function resolveChannelDeadLetter(
  store: Store,
  input: { orgId: string; deadLetterId: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await store.db
    .update(channelDeadLetters)
    .set({ resolvedAt: now, updatedAt: now })
    .where(
      and(eq(channelDeadLetters.id, input.deadLetterId), eq(channelDeadLetters.orgId, input.orgId)),
    )
    .returning({ id: channelDeadLetters.id });
  return rows.length === 1;
}
