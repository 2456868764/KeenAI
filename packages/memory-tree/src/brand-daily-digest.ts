import type { KeenaiDb } from "@keenai/storage";
import {
  type DigestDailyForBrandInput,
  type DigestDailyForBrandResult,
  type RunDigestDailyResult,
  digestDailyForBrand,
  runDigestDaily,
} from "./digest-daily.js";
import { brandDailyScopeKey } from "./scope-key.js";
import type { MemorySummaryFtsIndexer } from "./summary-fts-index.js";
import { defaultDigestDateUtc } from "./utc-date.js";

/** Aligns with `@keenai/memory` `MEMORY_INNGEST_EVENTS.DIGEST_DAILY`. */
export const MEMORY_TREE_DIGEST_DAILY_EVENT = "keenai/memory.digest_daily";

export const KEENI_MEMORY_TREE_MT04 = {
  enabled: true,
  target: "memory.digest_daily",
  notes: "MT-04 stub: brand:day UTC global node → memory_summaries + brand_daily episode.",
} as const;

export type BrandDailyDigestPayload = {
  dateUtc?: string;
  orgId?: string;
  brandId?: string;
};

export type NormalizedBrandDailyDigestInput = {
  dateUtc: string;
  orgId?: string;
  brandId?: string;
  summaryFtsIndexer?: MemorySummaryFtsIndexer | null;
};

export function normalizeBrandDailyDigestInput(
  payload?: BrandDailyDigestPayload,
  opts?: { summaryFtsIndexer?: MemorySummaryFtsIndexer | null },
): NormalizedBrandDailyDigestInput {
  return {
    dateUtc: payload?.dateUtc ?? defaultDigestDateUtc(),
    orgId: payload?.orgId,
    brandId: payload?.brandId,
    summaryFtsIndexer: opts?.summaryFtsIndexer,
  };
}

export function brandDailyScopeKeyForDigest(brandId: string, dateUtc: string): string {
  return brandDailyScopeKey(brandId, dateUtc);
}

/** MT-04 stub: run `memory.digest_daily` for all brands or a filtered org/brand pair. */
export async function runBrandDailyDigestStub(
  db: KeenaiDb,
  payload?: BrandDailyDigestPayload,
  opts?: { summaryFtsIndexer?: MemorySummaryFtsIndexer | null },
): Promise<RunDigestDailyResult> {
  const normalized = normalizeBrandDailyDigestInput(payload, opts);
  return runDigestDaily(db, {
    dateUtc: normalized.dateUtc,
    orgId: normalized.orgId,
    brandId: normalized.brandId,
    summaryFtsIndexer: normalized.summaryFtsIndexer,
  });
}

export type RunBrandDailyDigestForBrandInput = Omit<DigestDailyForBrandInput, "dateUtc"> & {
  dateUtc?: string;
};

/** MT-04 stub: build a single brand's global daily digest node. */
export async function runBrandDailyDigestForBrandStub(
  db: KeenaiDb,
  input: RunBrandDailyDigestForBrandInput,
): Promise<DigestDailyForBrandResult> {
  return digestDailyForBrand(db, {
    ...input,
    dateUtc: input.dateUtc ?? defaultDigestDateUtc(),
  });
}
