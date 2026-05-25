import { zValidator } from "@hono/zod-validator";
import {
  assembleMemoryContext,
  listHotTopics,
  queryBrandDailyDigest,
  queryChannelMemoryTree,
  queryConversationMemoryTree,
  queryCustomerMemoryTree,
  queryGraphRelated,
  queryMemoryExplorerStats,
  queryMemoryFacts,
  resolveMemoryFactsScope,
  searchMemoryChunks,
} from "@keenai/memory-tree";
import {
  API_VERSION,
  memoryContextQuerySchema,
  memoryDigestQuerySchema,
  memoryFactsQuerySchema,
  memoryGraphRelatedQuerySchema,
  memorySearchQuerySchema,
  memoryStatsQuerySchema,
  memoryTreeQuerySchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { canAccessBrand, getConversationForOrg } from "../lib/conversations.js";
import { getMemoryChunkEmbedder } from "../lib/memory-chunk-embed-init.js";
import { getMemoryChunkFtsStore } from "../lib/memory-chunk-fts-init.js";
import { getMemoryChunkVectorStore } from "../lib/memory-chunk-vector-init.js";
import { getMemorySummaryFtsStore } from "../lib/memory-summary-fts-init.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

export function memoryRoutes(_ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/memory`;

  r.get(`${prefix}/tree`, requireAuth(), zValidator("query", memoryTreeQuerySchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    const db = c.get("store").db;

    if (query.scope === "conversation") {
      const conversation = await getConversationForOrg(db, query.id, auth.orgId);
      if (!conversation) return c.json({ error: "conversation_not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const tree = await queryConversationMemoryTree(db, {
        orgId: auth.orgId,
        brandId: conversation.brandId,
        conversationId: conversation.id,
        mode: query.mode,
        level: query.level,
      });

      return c.json({ tree });
    }

    const brandId = query.brandId;
    if (!brandId || !canAccessBrand(auth, brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    if (query.scope === "customer") {
      const tree = await queryCustomerMemoryTree(db, {
        orgId: auth.orgId,
        brandId,
        userId: query.id,
        mode: query.mode,
        level: query.level,
      });

      return c.json({ tree });
    }

    const channelType = query.channelType;
    if (!channelType) {
      return c.json({ error: "channelType_required" }, 400);
    }

    const tree = await queryChannelMemoryTree(db, {
      orgId: auth.orgId,
      brandId,
      channelType,
      channelId: query.id,
      mode: query.mode,
      level: query.level,
    });

    return c.json({ tree });
  });

  r.get(
    `${prefix}/digest`,
    requireAuth(),
    zValidator("query", memoryDigestQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const { brandId, date } = c.req.valid("query");
      if (!canAccessBrand(auth, brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const digest = await queryBrandDailyDigest(c.get("store").db, {
        orgId: auth.orgId,
        brandId,
        dateUtc: date,
      });

      if (!digest) return c.json({ error: "digest_not_found" }, 404);
      return c.json({ digest });
    },
  );

  r.get(
    `${prefix}/context`,
    requireAuth(),
    zValidator("query", memoryContextQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      const db = c.get("store").db;
      const conversation = await getConversationForOrg(db, query.conversationId, auth.orgId);
      if (!conversation) return c.json({ error: "conversation_not_found" }, 404);
      if (!canAccessBrand(auth, conversation.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const context = await assembleMemoryContext(db, {
        orgId: auth.orgId,
        brandId: conversation.brandId,
        conversationId: conversation.id,
        userId: conversation.userId,
        instruction: query.instruction,
        dateUtc: query.date,
      });

      return c.json({ context });
    },
  );

  r.get(
    `${prefix}/stats`,
    requireAuth(),
    zValidator("query", memoryStatsQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const { brandId } = c.req.valid("query");
      if (!canAccessBrand(auth, brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const stats = await queryMemoryExplorerStats(c.get("store").db, {
        orgId: auth.orgId,
        brandId,
      });
      const hotTopics = await listHotTopics(c.get("store").db, {
        orgId: auth.orgId,
        brandId,
      });

      return c.json({ stats, hotTopics });
    },
  );

  r.get(
    `${prefix}/search`,
    requireAuth(),
    zValidator("query", memorySearchQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const results = await searchMemoryChunks(c.get("store").db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        q: query.q,
        scope: query.scope,
        limit: query.limit,
        chunkFts: getMemoryChunkFtsStore(),
        chunkVector: getMemoryChunkVectorStore(),
        queryEmbedder: getMemoryChunkEmbedder(),
        summaryFts: getMemorySummaryFtsStore(),
      });

      return c.json({ results });
    },
  );

  r.get(
    `${prefix}/facts`,
    requireAuth(),
    zValidator("query", memoryFactsQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const db = c.get("store").db;

      if (query.scope === "conversation") {
        const conversation = await getConversationForOrg(db, query.id, auth.orgId);
        if (!conversation) return c.json({ error: "conversation_not_found" }, 404);
        if (conversation.brandId !== query.brandId) {
          return c.json({ error: "forbidden" }, 403);
        }
      }

      const resolved = resolveMemoryFactsScope({
        scope: query.scope,
        id: query.id,
        channelType: query.channelType,
      });
      if ("error" in resolved) {
        return c.json({ error: resolved.error }, 400);
      }

      const facts = await queryMemoryFacts(db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        scope: resolved.scope,
        scopeId: resolved.scopeId,
        limit: query.limit,
      });

      return c.json({ facts });
    },
  );

  r.get(
    `${prefix}/graph/related`,
    requireAuth(),
    zValidator("query", memoryGraphRelatedQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const query = c.req.valid("query");
      if (!canAccessBrand(auth, query.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const graph = await queryGraphRelated(c.get("store").db, {
        orgId: auth.orgId,
        brandId: query.brandId,
        entityId: query.entityId,
        maxDepth: query.maxDepth,
      });

      if (graph.reason === "entity_not_found") {
        return c.json({ error: "entity_not_found" }, 404);
      }

      return c.json({ graph });
    },
  );

  return r;
}
