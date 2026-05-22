import { processAdmittedChunk } from "@keenai/memory-tree";
import type { Inngest } from "inngest";
import { Inngest as InngestClient } from "inngest";
import type { AppContext } from "../types.js";
import {
  type MemoryDispatchAdapter,
  createInngestMemoryDispatch,
  createSyncMemoryDispatch,
} from "./memory-dispatch.js";

let adapter: MemoryDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;

export function initMemoryDispatch(ctx: AppContext): MemoryDispatchAdapter {
  const handlers = {
    extractChunk: async (payload: { orgId: string; brandId: string; chunkId: string }) => {
      const result = await processAdmittedChunk(ctx.store.db, payload);
      return { processed: result.extracted };
    },
  };

  if (ctx.env.INNGEST_EVENT_KEY) {
    const client = new InngestClient({ id: ctx.env.INNGEST_APP_ID });
    inngestClient = client;
    adapter = createInngestMemoryDispatch(async (payload) => {
      await client.send(payload);
    });
    return adapter;
  }

  adapter = createSyncMemoryDispatch(handlers);
  return adapter;
}

export function getMemoryDispatch(): MemoryDispatchAdapter {
  if (!adapter) throw new Error("memory dispatch not initialized");
  return adapter;
}

export function getMemoryInngestClient(): Inngest | null {
  return inngestClient;
}
