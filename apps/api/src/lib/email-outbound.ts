import type { AuthConfig } from "@keenai/auth";
import {
  type EmailSendJobData,
  type EmailSendQueueDeps,
  enqueueEmailSend,
  sendEmailNow,
  startEmailSendWorker,
} from "@keenai/channels-email";
import type { ApiEnv } from "@keenai/shared";
import { conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";

type Db = AppVariables["store"]["db"];

let emailQueueResources: ReturnType<typeof startEmailSendWorker> | null = null;

export function getEmailQueue() {
  return emailQueueResources?.queue ?? null;
}

export function initEmailSendQueue(env: ApiEnv, authConfig: AuthConfig) {
  if (emailQueueResources || env.NODE_ENV === "test") return null;
  if (!env.REDIS_URL || !authConfig.smtp) return null;

  const deps: EmailSendQueueDeps = {
    redisUrl: env.REDIS_URL,
    smtp: authConfig.smtp,
  };
  emailQueueResources = startEmailSendWorker(deps);
  return emailQueueResources;
}

export async function buildEmailSendJob(
  db: Db,
  input: {
    conversationId: string;
    orgId: string;
    plainText: string;
    agentName?: string;
    messageId?: string;
  },
): Promise<EmailSendJobData | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);

  if (!conversation || conversation.channelType !== "email") return null;
  if (!conversation.userId?.includes("@")) return null;

  const [lastInbound] = await db
    .select({ inReplyTo: messages.inReplyTo })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.orgId, input.orgId),
        eq(messages.senderType, "user"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  const inReplyTo = lastInbound?.inReplyTo ?? conversation.channelId ?? undefined;
  const references = inReplyTo ? [inReplyTo] : undefined;

  return {
    to: conversation.userId,
    subject: conversation.subject ?? "Support",
    plainText: input.plainText,
    agentName: input.agentName ?? "KeenAI",
    conversationSubject: conversation.subject ?? "Support",
    inReplyTo,
    references,
    conversationId: conversation.id,
    messageId: input.messageId,
  };
}

export async function dispatchEmailOutbound(
  db: Db,
  env: ApiEnv,
  authConfig: AuthConfig,
  job: EmailSendJobData,
): Promise<{ mode: "queued" | "sent" | "skipped"; jobId?: string; reason?: string }> {
  if (!authConfig.smtp) {
    return { mode: "skipped", reason: "smtp_not_configured" };
  }

  const queue = getEmailQueue();
  if (queue && env.REDIS_URL) {
    const jobId = await enqueueEmailSend(queue, job);
    return { mode: "queued", jobId };
  }

  const result = await sendEmailNow(authConfig.smtp, job);
  return { mode: "sent", jobId: result.messageId };
}
