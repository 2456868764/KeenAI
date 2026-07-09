import {
  KB_INNGEST_EVENTS,
  type KbCrystallizePayload,
  type KbIngestPayload,
  buildKbCrystallizePayloadFromConversation,
} from "@keenai/kb";
import type { KeenaiDb } from "@keenai/storage";

export type KbDispatchAdapter = {
  mode: "sync" | "inngest";
  enqueueConversationClosed: (payload: KbCrystallizePayload) => Promise<void>;
  enqueueSourceIngest: (payload: KbIngestPayload) => Promise<void>;
};

export function createSyncKbDispatch(
  runCrystallize: (payload: KbCrystallizePayload) => Promise<unknown>,
  runIngest: (payload: KbIngestPayload) => Promise<unknown>,
): KbDispatchAdapter {
  return {
    mode: "sync",
    enqueueConversationClosed: async (payload) => {
      await runCrystallize(payload);
    },
    enqueueSourceIngest: async (payload) => {
      await runIngest(payload);
    },
  };
}

export function createInngestKbDispatch(
  send: (payload: { name: string; data: KbCrystallizePayload | KbIngestPayload }) => Promise<void>,
): KbDispatchAdapter {
  return {
    mode: "inngest",
    enqueueConversationClosed: async (payload) => {
      await send({ name: KB_INNGEST_EVENTS.CONVERSATION_CLOSED, data: payload });
    },
    enqueueSourceIngest: async (payload) => {
      await send({ name: KB_INNGEST_EVENTS.INGEST, data: payload });
    },
  };
}

/** Emit keenai/conversation.closed when a conversation closes (KB-19). */
export async function dispatchKbConversationClosed(
  adapter: KbDispatchAdapter,
  db: KeenaiDb,
  input: { orgId: string; brandId: string; conversationId: string },
): Promise<{ dispatched: boolean; reason?: string }> {
  const envDefault = process.env.KEENAI_CRYSTALLIZE_DEFAULT_CSAT;
  const defaultCsatWhenMissing =
    envDefault !== undefined && envDefault !== "" ? Number.parseInt(envDefault, 10) : undefined;

  const payload = await buildKbCrystallizePayloadFromConversation(db, {
    ...input,
    defaultCsatWhenMissing:
      defaultCsatWhenMissing !== undefined && !Number.isNaN(defaultCsatWhenMissing)
        ? defaultCsatWhenMissing
        : undefined,
  });
  if (!payload) {
    return { dispatched: false, reason: "crystallize_payload_unavailable" };
  }

  await adapter.enqueueConversationClosed(payload);
  return { dispatched: true };
}
