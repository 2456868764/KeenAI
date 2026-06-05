import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations } from "@keenai/storage/schema";
import type {
  WorkflowAutoClosePayload,
  WorkflowAutoCloseResult,
  WorkflowCsatTimerPayload,
  WorkflowCsatTimerResult,
  WorkflowTimerHandlers,
} from "@keenai/workflow";
import { and, eq } from "drizzle-orm";
import { getKbDispatch } from "./kb-dispatch-init.js";
import { dispatchKbConversationClosed } from "./kb-dispatch.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export function createWorkflowTimerHandlers(db: Db, _env: ApiEnv): WorkflowTimerHandlers {
  return {
    runAutoCloseTimer: async (payload): Promise<WorkflowAutoCloseResult> => {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.id, payload.conversationId), eq(conversations.orgId, payload.orgId)),
        )
        .limit(1);

      if (!conversation) {
        return { closed: false, skipped: true, reason: "conversation_not_found" };
      }
      if (conversation.status === "closed") {
        return { closed: false, skipped: true, reason: "already_closed" };
      }

      await db
        .update(conversations)
        .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));

      try {
        await dispatchKbConversationClosed(getKbDispatch(), db, {
          orgId: payload.orgId,
          brandId: payload.brandId,
          conversationId: conversation.id,
        });
      } catch {
        // KB crystallize is best-effort on auto-close
      }

      return { closed: true };
    },

    runCsatTimer: async (payload): Promise<WorkflowCsatTimerResult> => {
      const [conversation] = await db
        .select({ rating: conversations.rating })
        .from(conversations)
        .where(
          and(eq(conversations.id, payload.conversationId), eq(conversations.orgId, payload.orgId)),
        )
        .limit(1);

      if (!conversation) {
        return { rated: false, reason: "conversation_not_found" };
      }

      if (conversation.rating !== null && conversation.rating !== undefined) {
        return { rated: true, rating: conversation.rating };
      }

      return {
        rated: false,
        timedOut: Boolean(payload.waitForRating),
        reason: payload.waitForRating ? "rating_timeout" : "no_rating",
      };
    },
  };
}
