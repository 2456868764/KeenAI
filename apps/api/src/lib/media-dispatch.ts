export const MEDIA_INNGEST_EVENTS = {
  MESSAGE_CREATED: "keenai/conversation.message.created",
} as const;

export type MediaMessageCreatedPayload = {
  orgId: string;
  conversationId: string;
  messageId: string;
};

export type MediaDispatchAdapter = {
  mode: "sync" | "inngest";
  enqueueMessageMedia: (payload: MediaMessageCreatedPayload) => Promise<void>;
};

export type MediaDispatchHandlers = {
  processMessageMedia: (payload: MediaMessageCreatedPayload) => Promise<{ transcribed: number }>;
};

export function createSyncMediaDispatch(handlers: MediaDispatchHandlers): MediaDispatchAdapter {
  return {
    mode: "sync",
    enqueueMessageMedia: async (payload) => {
      await handlers.processMessageMedia(payload);
    },
  };
}

export function createInngestMediaDispatch(
  send: (payload: { name: string; data: Record<string, unknown> }) => Promise<void>,
): MediaDispatchAdapter {
  return {
    mode: "inngest",
    enqueueMessageMedia: async (payload) => {
      await send({ name: MEDIA_INNGEST_EVENTS.MESSAGE_CREATED, data: payload });
    },
  };
}
