import type { AppContext } from "../types.js";
import { runKbCrystallizeJob } from "./kb-crystallize-pipeline.js";
import {
  type KbDispatchAdapter,
  createInngestKbDispatch,
  createSyncKbDispatch,
} from "./kb-dispatch.js";
import { getInngestClient } from "./workflow-dispatch.js";

let adapter: KbDispatchAdapter | null = null;

export function initKbDispatch(ctx: AppContext): KbDispatchAdapter {
  const runCrystallize = async (payload: Parameters<typeof runKbCrystallizeJob>[1]) => {
    await runKbCrystallizeJob(ctx.store.db, payload);
  };

  const client = getInngestClient();
  if (ctx.env.INNGEST_EVENT_KEY && client) {
    adapter = createInngestKbDispatch(async (event) => {
      await client.send(event);
    });
    return adapter;
  }

  adapter = createSyncKbDispatch(runCrystallize);
  return adapter;
}

export function getKbDispatch(): KbDispatchAdapter {
  if (!adapter) throw new Error("kb dispatch not initialized");
  return adapter;
}
