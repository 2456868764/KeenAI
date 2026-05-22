import { extractChunk } from "@keenai/memory-tree";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { MEMORY_INNGEST_EVENTS } from "./memory-dispatch.js";

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
      return extractChunk(ctx.store.db, data.chunkId);
    },
  );

  return [extract] as const;
}
