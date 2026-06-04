import type { KeenaiDb } from "@keenai/storage";
import { conversations, messages } from "@keenai/storage/schema";
import { and, asc, eq } from "drizzle-orm";
import type { KbCrystallizePayload } from "../inngest/types.js";
import { KB_CRYSTALLIZE_MIN_CSAT } from "./crystallize.js";

export type BuildKbCrystallizePayloadInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  /** When conversation.rating is null, use only if explicitly set (e.g. dev `KEENAI_CRYSTALLIZE_DEFAULT_CSAT`). */
  defaultCsatWhenMissing?: number;
};

/** Build crystallize input from a closed conversation transcript. */
export async function buildKbCrystallizePayloadFromConversation(
  db: KeenaiDb,
  input: BuildKbCrystallizePayloadInput,
): Promise<KbCrystallizePayload | null> {
  const [conversation] = await db
    .select({
      userId: conversations.userId,
      rating: conversations.rating,
      status: conversations.status,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
      ),
    )
    .limit(1);

  if (!conversation || conversation.status !== "closed") return null;

  const rows = await db
    .select({
      senderType: messages.senderType,
      plainText: messages.plainText,
      isInternal: messages.isInternal,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, input.conversationId), eq(messages.orgId, input.orgId)))
    .orderBy(asc(messages.createdAt));

  const external = rows.filter((row) => !row.isInternal && row.plainText?.trim());
  const userMessages = external.filter((row) => row.senderType === "user");
  const agentMessages = external.filter((row) => row.senderType === "agent");

  if (userMessages.length === 0 || agentMessages.length === 0) return null;

  const question = userMessages[0]?.plainText?.trim() ?? "";
  const answer = agentMessages[agentMessages.length - 1]?.plainText?.trim() ?? "";
  if (!question || !answer) return null;

  const csatScore =
    conversation.rating ??
    (input.defaultCsatWhenMissing !== undefined ? input.defaultCsatWhenMissing : null);
  if (csatScore === null || csatScore < KB_CRYSTALLIZE_MIN_CSAT) return null;

  return {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    userId: conversation.userId ?? "unknown",
    csatScore,
    question,
    answer,
  };
}
