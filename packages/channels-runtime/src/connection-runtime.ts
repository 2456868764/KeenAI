import { randomUUID } from "node:crypto";
import type { Store } from "@keenai/storage";
import { channelConnections } from "@keenai/storage/schema";
import { and, asc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";

const DEFAULT_LEASE_MS = 45_000;

export type ClaimedChannelConnectionRuntime = {
  connection: typeof channelConnections.$inferSelect;
  leaseToken: string;
};

export async function listRunnableChannelConnections(store: Store, input: { limit?: number } = {}) {
  return store.db
    .select()
    .from(channelConnections)
    .where(
      and(eq(channelConnections.status, "active"), ne(channelConnections.transport, "webhook")),
    )
    .orderBy(asc(channelConnections.updatedAt))
    .limit(input.limit ?? 100);
}

export async function claimChannelConnectionRuntime(
  store: Store,
  input: {
    connectionId: string;
    ownerId: string;
    now?: Date;
    leaseMs?: number;
  },
): Promise<ClaimedChannelConnectionRuntime | null> {
  const now = input.now ?? new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
  const leaseAvailable = or(
    isNull(channelConnections.runtimeLeaseExpiresAt),
    lte(channelConnections.runtimeLeaseExpiresAt, now),
    eq(channelConnections.runtimeOwnerId, input.ownerId),
  );
  const retryAvailable = or(
    isNull(channelConnections.runtimeNextAttemptAt),
    lte(channelConnections.runtimeNextAttemptAt, now),
  );
  const [connection] = await store.db
    .update(channelConnections)
    .set({
      runtimeState: "connecting",
      runtimeOwnerId: input.ownerId,
      runtimeLeaseToken: leaseToken,
      runtimeLeaseExpiresAt: leaseExpiresAt,
      runtimeHeartbeatAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnections.id, input.connectionId),
        eq(channelConnections.status, "active"),
        ne(channelConnections.transport, "webhook"),
        retryAvailable,
        leaseAvailable,
      ),
    )
    .returning();
  return connection ? { connection, leaseToken } : null;
}

export async function heartbeatChannelConnectionRuntime(
  store: Store,
  input: {
    connectionId: string;
    ownerId: string;
    leaseToken: string;
    state?: "connected" | "reconnecting";
    cursor?: Record<string, unknown>;
    now?: Date;
    leaseMs?: number;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const state = input.state ?? "connected";
  const rows = await store.db
    .update(channelConnections)
    .set({
      runtimeState: state,
      runtimeLeaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)),
      runtimeHeartbeatAt: now,
      ...(input.cursor ? { runtimeCursor: input.cursor } : {}),
      ...(state === "connected"
        ? {
            lastConnectedAt: now,
            lastError: null,
            reconnectAttempts: 0,
            runtimeNextAttemptAt: null,
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnections.id, input.connectionId),
        eq(channelConnections.status, "active"),
        eq(channelConnections.runtimeOwnerId, input.ownerId),
        eq(channelConnections.runtimeLeaseToken, input.leaseToken),
      ),
    )
    .returning({ id: channelConnections.id });
  return rows.length === 1;
}

export async function releaseChannelConnectionRuntime(
  store: Store,
  input: {
    connectionId: string;
    ownerId: string;
    leaseToken: string;
    cursor?: Record<string, unknown>;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await store.db
    .update(channelConnections)
    .set({
      runtimeState: "stopped",
      runtimeOwnerId: null,
      runtimeLeaseToken: null,
      runtimeLeaseExpiresAt: null,
      runtimeHeartbeatAt: now,
      runtimeNextAttemptAt: null,
      ...(input.cursor ? { runtimeCursor: input.cursor } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnections.id, input.connectionId),
        eq(channelConnections.runtimeOwnerId, input.ownerId),
        eq(channelConnections.runtimeLeaseToken, input.leaseToken),
      ),
    )
    .returning({ id: channelConnections.id });
  return rows.length === 1;
}

export async function failChannelConnectionRuntime(
  store: Store,
  input: {
    connectionId: string;
    ownerId: string;
    leaseToken: string;
    error: string;
    cursor?: Record<string, unknown>;
    retryAfterMs?: number;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await store.db
    .update(channelConnections)
    .set({
      runtimeState: "error",
      runtimeOwnerId: null,
      runtimeLeaseToken: null,
      runtimeLeaseExpiresAt: null,
      runtimeHeartbeatAt: now,
      runtimeNextAttemptAt: new Date(now.getTime() + (input.retryAfterMs ?? 5_000)),
      ...(input.cursor ? { runtimeCursor: input.cursor } : {}),
      reconnectAttempts: sql`${channelConnections.reconnectAttempts} + 1`,
      lastError: input.error,
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnections.id, input.connectionId),
        eq(channelConnections.runtimeOwnerId, input.ownerId),
        eq(channelConnections.runtimeLeaseToken, input.leaseToken),
      ),
    )
    .returning({ id: channelConnections.id });
  return rows.length === 1;
}
