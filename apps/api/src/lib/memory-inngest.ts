import { processAdmittedChunk, runDigestDaily } from "@keenai/memory-tree";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { MEMORY_INNGEST_EVENTS } from "./memory-dispatch.js";

export const MEMORY_DIGEST_CRON_DEFAULT = "0 0 * * *";

export function createMemoryInngestFunctions(client: Inngest, ctx: AppContext) {
  const extract = client.createFunction(
    { id: "keenai-memory-extract-chunk" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK },
    async ({ event }) => {
      const data = event.data as {
        orgId: string;
        brandId: string;
        chunkId: string;
      };
      return processAdmittedChunk(ctx.store.db, data);
    },
  );

  const digestDaily = client.createFunction(
    { id: "keenai-memory-digest-daily" },
    { event: MEMORY_INNGEST_EVENTS.DIGEST_DAILY },
    async ({ event }) => {
      const data = (event.data ?? {}) as {
        dateUtc?: string;
        orgId?: string;
        brandId?: string;
      };
      return runDigestDaily(ctx.store.db, data);
    },
  );

  const digestDailyCron = client.createFunction(
    { id: "keenai-memory-digest-daily-cron" },
    { cron: ctx.env.INNGEST_MEMORY_DIGEST_CRON },
    async () => runDigestDaily(ctx.store.db),
  );

  return [extract, digestDaily, digestDailyCron] as const;
}
