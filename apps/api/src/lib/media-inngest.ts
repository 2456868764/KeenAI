import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { MEDIA_INNGEST_EVENTS } from "./media-dispatch.js";
import { processMessageMedia } from "./media/process-message-media.js";

export function createMediaInngestFunctions(client: Inngest, ctx: AppContext) {
  const transcribe = client.createFunction(
    { id: "keenai-media-transcribe" },
    { event: MEDIA_INNGEST_EVENTS.MESSAGE_CREATED },
    async ({ event }) => {
      const data = event.data as {
        orgId: string;
        conversationId: string;
        messageId: string;
      };
      return processMessageMedia(ctx, data);
    },
  );

  return [transcribe] as const;
}
