import { randomUUID } from "node:crypto";

export const DEFAULT_LEASE_MS = 60_000;

export function createClaim(now: Date, leaseMs = DEFAULT_LEASE_MS) {
  return {
    claimToken: randomUUID(),
    claimedAt: now,
    leaseExpiresAt: new Date(now.getTime() + leaseMs),
  };
}

export function retryAt(attempt: number, now: Date, retryAfterMs?: number): Date {
  const exponentialMs = Math.min(60_000 * 30, 1_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + (retryAfterMs ?? exponentialMs));
}
