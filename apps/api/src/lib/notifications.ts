import { members, notifications } from "@keenai/storage/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { publishNotification } from "./notification-bus.js";

export function serializeNotification(row: typeof notifications.$inferSelect) {
  return {
    id: row.id,
    accountId: row.accountId,
    orgId: row.orgId,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    link: row.link,
    payload: row.payload,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createNotification(
  db: AppVariables["store"]["db"],
  input: {
    accountId: string;
    orgId: string;
    eventType: string;
    title: string;
    body?: string;
    link?: string;
    payload?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(notifications)
    .values({
      accountId: input.accountId,
      orgId: input.orgId,
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      link: input.link,
      payload: input.payload,
    })
    .returning();

  if (!row) throw new Error("notification insert failed");

  const serialized = serializeNotification(row);
  publishNotification({
    type: "notification.created",
    accountId: input.accountId,
    notification: serialized,
  });

  return serialized;
}

export async function notifyAssignee(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    assigneeMemberId: string;
    conversationId: string;
    subject: string | null;
    actorMemberId: string;
  },
) {
  if (input.assigneeMemberId === input.actorMemberId) return;

  const [member] = await db
    .select({ accountId: members.accountId })
    .from(members)
    .where(and(eq(members.id, input.assigneeMemberId), eq(members.orgId, input.orgId)))
    .limit(1);

  if (!member) return;

  await createNotification(db, {
    accountId: member.accountId,
    orgId: input.orgId,
    eventType: "conversation.assigned",
    title: "Conversation assigned to you",
    body: input.subject ?? "New assignment",
    link: `/inbox?conversation=${input.conversationId}`,
    payload: { conversationId: input.conversationId },
  });
}
