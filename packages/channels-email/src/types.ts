import { z } from "zod";

export const parsedInboundEmailSchema = z.object({
  messageId: z.string(),
  from: z.object({ address: z.string().email(), name: z.string().optional() }),
  to: z.array(z.object({ address: z.string().email(), name: z.string().optional() })),
  subject: z.string(),
  plainText: z.string(),
  html: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()),
  date: z.string().optional(),
});

export type ParsedInboundEmail = z.infer<typeof parsedInboundEmailSchema>;

export type SmtpTransportConfig = {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export type OutboundEmailInput = {
  to: string;
  subject: string;
  plainText: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
};

export type ThreadCandidate = {
  channelId: string;
  subject: string;
  matchReason: "in-reply-to" | "references" | "subject";
};
