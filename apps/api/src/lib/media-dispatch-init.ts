import type { Inngest } from "inngest";
import { Inngest as InngestClient } from "inngest";
import type { AppContext } from "../types.js";
import {
  type MediaDispatchAdapter,
  createInngestMediaDispatch,
  createSyncMediaDispatch,
} from "./media-dispatch.js";
import { processMessageMedia } from "./media/process-message-media.js";

let adapter: MediaDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;

export function initMediaDispatch(ctx: AppContext): MediaDispatchAdapter {
  const handlers = {
    processMessageMedia: (payload: {
      orgId: string;
      conversationId: string;
      messageId: string;
    }) => processMessageMedia(ctx, payload),
  };

  if (ctx.env.INNGEST_EVENT_KEY) {
    const client = new InngestClient({ id: ctx.env.INNGEST_APP_ID });
    inngestClient = client;
    adapter = createInngestMediaDispatch(async (payload) => {
      await client.send(payload);
    });
    return adapter;
  }

  adapter = createSyncMediaDispatch(handlers);
  return adapter;
}

export function getMediaDispatch(): MediaDispatchAdapter {
  if (!adapter) throw new Error("media dispatch not initialized");
  return adapter;
}

export function getMediaInngestClient(): Inngest | null {
  return inngestClient;
}
