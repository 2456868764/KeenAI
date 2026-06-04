import type { KeenaiDb } from "@keenai/storage";
import {
  type BrandDailyDigestResult,
  type ConversationMemoryTreeResult,
  type CustomerMemoryTreeResult,
  queryBrandDailyDigest,
  queryConversationMemoryTree,
  queryCustomerMemoryTree,
} from "./query.js";
import { brandDailyScopeKey, conversationScopeKey, customerScopeKey } from "./scope-key.js";
import type { MemoryScope } from "./scope-router.js";
import { defaultDigestDateUtc } from "./utc-date.js";

export const MEMORY_TREE_RETRIEVAL_SCOPES = ["conversation", "customer", "brand_daily"] as const;

export type MemoryTreeRetrievalScope = (typeof MEMORY_TREE_RETRIEVAL_SCOPES)[number];

export const KEENI_MEMORY_TREE_MT05 = {
  enabled: true,
  target: "GET /memory/tree · /memory/digest",
  notes: "MT-05 stub: unified retrieval router for conversation / customer / brand_daily.",
} as const;

export type QueryMemoryTreeByScopeInput =
  | {
      scope: "conversation";
      orgId: string;
      brandId: string;
      conversationId: string;
      mode: "latest" | "drill_down";
      level?: number;
    }
  | {
      scope: "customer";
      orgId: string;
      brandId: string;
      userId: string;
      mode: "latest" | "drill_down";
      level?: number;
    }
  | {
      scope: "brand_daily";
      orgId: string;
      brandId: string;
      dateUtc?: string;
    };

export type MemoryTreeRetrievalResult =
  | ConversationMemoryTreeResult
  | CustomerMemoryTreeResult
  | BrandDailyDigestResult;

export function isMemoryTreeRetrievalScope(value: string): value is MemoryTreeRetrievalScope {
  return (MEMORY_TREE_RETRIEVAL_SCOPES as readonly string[]).includes(value);
}

/** Map agent scope-router output to a tree retrieval scope when applicable. */
export function memoryScopeToRetrievalScope(scope: MemoryScope): MemoryTreeRetrievalScope | null {
  if (scope === "conversation" || scope === "customer" || scope === "brand_daily") {
    return scope;
  }
  return null;
}

export function retrievalScopeKey(input: QueryMemoryTreeByScopeInput): string {
  switch (input.scope) {
    case "conversation":
      return conversationScopeKey(input.conversationId);
    case "customer":
      return customerScopeKey(input.userId);
    case "brand_daily":
      return brandDailyScopeKey(input.brandId, input.dateUtc ?? defaultDigestDateUtc());
  }
}

/** MT-05 stub: route retrieval to conversation tree, customer tree, or brand daily digest. */
export async function queryMemoryTreeByScope(
  db: KeenaiDb,
  input: QueryMemoryTreeByScopeInput,
): Promise<MemoryTreeRetrievalResult | null> {
  switch (input.scope) {
    case "conversation":
      return queryConversationMemoryTree(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
        mode: input.mode,
        level: input.level,
      });
    case "customer":
      return queryCustomerMemoryTree(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        userId: input.userId,
        mode: input.mode,
        level: input.level,
      });
    case "brand_daily":
      return queryBrandDailyDigest(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        dateUtc: input.dateUtc ?? defaultDigestDateUtc(),
      });
  }
}
