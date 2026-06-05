import { Queue, Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { createSmtpTransport, sendAgentReply } from "./outbound.js";
import type { SmtpTransportConfig } from "./types.js";

export const EMAIL_SEND_QUEUE = "email:send";
export const EMAIL_SEND_DLQ = "email:send:dlq";

export type EmailSendJobData = {
  to: string;
  subject: string;
  plainText: string;
  agentName: string;
  conversationSubject: string;
  inReplyTo?: string;
  references?: string[];
  conversationId?: string;
  messageId?: string;
};

export type EmailSendQueueDeps = {
  redisUrl: string;
  smtp: SmtpTransportConfig;
};

function parseRedisUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export function createEmailSendQueue(redisUrl: string) {
  const connection = parseRedisUrl(redisUrl);
  const queue = new Queue<EmailSendJobData>(EMAIL_SEND_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: false,
    },
  });
  const dlq = new Queue<EmailSendJobData & { failedReason?: string }>(EMAIL_SEND_DLQ, {
    connection,
    defaultJobOptions: { removeOnComplete: 500 },
  });
  return { queue, dlq, connection };
}

export async function enqueueEmailSend(
  queue: Queue<EmailSendJobData>,
  data: EmailSendJobData,
): Promise<string> {
  const job = await queue.add("send", data, {
    jobId: data.messageId ? `email-${data.messageId}` : undefined,
  });
  return job.id ?? "queued";
}

export async function sendEmailNow(
  smtp: SmtpTransportConfig,
  data: EmailSendJobData,
): Promise<{ messageId: string }> {
  const transport = createSmtpTransport(smtp);
  return sendAgentReply(
    transport,
    smtp.from,
    data.to,
    {
      agentName: data.agentName,
      plainText: data.plainText,
      conversationSubject: data.conversationSubject,
    },
    { inReplyTo: data.inReplyTo, references: data.references },
  );
}

export function startEmailSendWorker(
  deps: EmailSendQueueDeps,
  opts?: { onSent?: (data: EmailSendJobData, messageId: string) => void },
) {
  const { queue, dlq, connection } = createEmailSendQueue(deps.redisUrl);

  const worker = new Worker<EmailSendJobData>(
    EMAIL_SEND_QUEUE,
    async (job) => {
      const result = await sendEmailNow(deps.smtp, job.data);
      opts?.onSent?.(job.data, result.messageId);
      return result;
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await dlq.add("dead", {
      ...job.data,
      failedReason: err instanceof Error ? err.message : String(err),
    });
  });

  return { worker, queue, dlq };
}

export async function closeEmailSendResources(resources: {
  worker?: Worker;
  queue?: Queue;
  dlq?: Queue;
  connection?: RedisOptions;
}) {
  await resources.worker?.close();
  await resources.queue?.close();
  await resources.dlq?.close();
}

/** Test helper — avoids live Redis in unit tests. */
export function createInMemoryEmailSendHandler(smtp: SmtpTransportConfig) {
  return async (data: EmailSendJobData) => sendEmailNow(smtp, data);
}
