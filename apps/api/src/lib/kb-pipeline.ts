import { type KbChunkFtsIndexer, createKeenaiKb, resolveKbConnectorForSource } from "@keenai/kb";
import { type KbIngestPayload, runKbIngestPipeline } from "@keenai/kb/inngest";
import { type LibsqlStore, type Store, createLibsqlKbChunkFtsStore } from "@keenai/storage";
import { kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export const KB_INGEST_NOTIFY_CHANNEL = "kb.ingest.completed";
export const KB_DOCUMENT_INDEXED_CHANNEL = "kb/document.indexed";

export type KbIngestNotifyPayload = {
  orgId: string;
  brandId: string;
  sourceId: string;
  documentId?: string;
  ok: boolean;
  failedStep?: string;
};

export type KbDocumentIndexedPayload = {
  orgId: string;
  brandId: string;
  sourceId: string;
  documentIds: string[];
  chunkCount: number;
  cacheInvalidated: boolean;
  agentReevaluationQueued: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createChunkFtsIndexer(store: Store): KbChunkFtsIndexer | null {
  if (store.dialect !== "libsql") return null;
  return createLibsqlKbChunkFtsStore((store as LibsqlStore).client);
}

async function markSourceError(store: Store, sourceId: string, error: string) {
  await store.db
    .update(kbSources)
    .set({ status: "error", error, updatedAt: new Date() })
    .where(eq(kbSources.id, sourceId));
}

/** API wiring for KB-16 ingest pipeline: source connector sync -> document index -> notify. */
export async function runKbIngestForSource(store: Store, payload: KbIngestPayload) {
  const db = store.db;
  const kb = createKeenaiKb({ db });
  const chunkFtsIndexer = createChunkFtsIndexer(store);
  const [source] = await db
    .select()
    .from(kbSources)
    .where(eq(kbSources.id, payload.sourceId))
    .limit(1);

  if (!source || source.orgId !== payload.orgId || source.brandId !== payload.brandId) {
    throw new Error("kb_source_not_found");
  }

  const connector = resolveKbConnectorForSource(source.type, source.config);
  if (!connector) {
    await markSourceError(store, payload.sourceId, `connector_unavailable:${source.type}`);
    throw new Error(`kb_connector_unavailable:${source.type}`);
  }

  await db
    .update(kbSources)
    .set({ status: "syncing", error: null, updatedAt: new Date() })
    .where(eq(kbSources.id, payload.sourceId));

  return runKbIngestPipeline(payload, {
    handlers: {
      fetch: async (state) => {
        const healthy = await connector.healthCheck();
        if (!healthy) throw new Error("kb_connector_unhealthy");
        const result = await kb.syncSource({
          orgId: payload.orgId,
          brandId: payload.brandId,
          sourceId: payload.sourceId,
          connector,
        });
        state.artifacts.sync = result;
        return {
          detail: `synced:${result.synced}/${result.listed}`,
          metadata: result,
        };
      },
      parse: async (state) => {
        const documents = await db
          .select({ id: kbDocuments.id })
          .from(kbDocuments)
          .where(
            and(
              eq(kbDocuments.orgId, payload.orgId),
              eq(kbDocuments.brandId, payload.brandId),
              eq(kbDocuments.sourceId, payload.sourceId),
              eq(kbDocuments.status, "active"),
              ...(payload.documentId ? [eq(kbDocuments.id, payload.documentId)] : []),
            ),
          );
        const documentIds = documents.map((document) => document.id);
        state.artifacts.documentIds = documentIds;
        return { detail: `documents:${documentIds.length}` };
      },
      clean: async () => ({ detail: "source-filtered" }),
      chunk: async (state) => {
        const count = Array.isArray(state.artifacts.documentIds)
          ? state.artifacts.documentIds.length
          : 0;
        return { detail: `planned:${count}` };
      },
      enrich: async () => ({ detail: `source:${source.type}` }),
      embed: async () => ({ detail: "stub-embedder" }),
      index: async (state) => {
        const documentIds = Array.isArray(state.artifacts.documentIds)
          ? state.artifacts.documentIds.filter((id): id is string => typeof id === "string")
          : [];
        let chunkCount = 0;
        for (const documentId of documentIds) {
          const result = await kb.indexDocument({
            orgId: payload.orgId,
            brandId: payload.brandId,
            documentId,
            chunkFtsIndexer,
          });
          chunkCount += result.chunkCount;
        }
        state.artifacts.indexed = { documentIds, chunkCount };
        return {
          detail: `indexed:${documentIds.length}`,
          metadata: { documents: documentIds.length, chunks: chunkCount, fts: !!chunkFtsIndexer },
        };
      },
      notify: async (state) => {
        const ok = !state.failedStep;
        if (ok) {
          await db
            .update(kbSources)
            .set({ status: "active", error: null, updatedAt: new Date() })
            .where(eq(kbSources.id, payload.sourceId));
          const indexed =
            typeof state.artifacts.indexed === "object" && state.artifacts.indexed !== null
              ? (state.artifacts.indexed as { documentIds?: unknown; chunkCount?: unknown })
              : {};
          await store.notify<KbDocumentIndexedPayload>(KB_DOCUMENT_INDEXED_CHANNEL, {
            orgId: payload.orgId,
            brandId: payload.brandId,
            sourceId: payload.sourceId,
            documentIds: Array.isArray(indexed.documentIds)
              ? indexed.documentIds.filter((id): id is string => typeof id === "string")
              : [],
            chunkCount:
              typeof indexed.chunkCount === "number" && Number.isFinite(indexed.chunkCount)
                ? indexed.chunkCount
                : 0,
            cacheInvalidated: true,
            agentReevaluationQueued: true,
          });
        } else {
          await markSourceError(store, payload.sourceId, `failed:${state.failedStep}`);
        }
        await store.notify<KbIngestNotifyPayload>(KB_INGEST_NOTIFY_CHANNEL, {
          ...payload,
          ok,
          failedStep: state.failedStep,
        });
        return { detail: ok ? "completed" : `failed:${state.failedStep}` };
      },
    },
  }).catch(async (error) => {
    await markSourceError(store, payload.sourceId, errorMessage(error));
    throw error;
  });
}
